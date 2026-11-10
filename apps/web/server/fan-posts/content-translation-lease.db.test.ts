// Real SQL behind the real route, several "servers" (separate handler sets) sharing one database; the provider is faked and counted.
// Runs only against a disposable database that has 20261222120000_content_translation_leases applied: TR_LEASE_DB=1 with PGHOST, PGPORT,
// PGUSER and PGDATABASE (or -d via PGDATABASE) pointing at it. The posts end soft-deleted; the users, artist, and their ids (ac2a0000-...) stay (hard deletes need the lifecycle role).
import { spawn } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createContentHandlers, type ContentDependencies } from "./routes";

const literal = (value: unknown) => value === null || value === undefined ? "null" : typeof value === "number" || typeof value === "boolean" ? String(value)
  : `'${(typeof value === "object" ? JSON.stringify(value) : String(value)).replaceAll("'", "''")}'${typeof value === "object" ? "::jsonb" : ""}`;
function sql(text: string, service = true): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn("psql", ["-X", "-qAt", "-v", "ON_ERROR_STOP=1"], { stdio: ["pipe", "pipe", "pipe"], env: process.env });
    let out = "", err = "";
    child.stdout.on("data", chunk => { out += chunk; }); child.stderr.on("data", chunk => { err += chunk; });
    child.on("close", code => {
      if (code !== 0) { reject(new Error(err.match(/(?:FANPAGE|FAN_WEB|TRANSLATION)_[A-Z_]+/)?.[0] ?? err.trim())); return; }
      try { resolve(out.trim() ? JSON.parse(out.trim()) : null); } catch { resolve(out.trim()); }
    });
    child.stdin.end(`set standard_conforming_strings=on; ${service ? "set role service_role;" : ""}\n${text}\n`);
  });
}
const users = { owner: "ac2a0000-0000-4000-8000-000000000001", viewer: "ac2a0000-0000-4000-8000-000000000002", viewer2: "ac2a0000-0000-4000-8000-000000000003", artist: "ac2a0000-0000-4000-8000-000000000004" };
// Fresh posts every run, so a failed earlier run cannot leave hidden or cached state behind.
const postKeys = ["slotsRace", "wholeRace", "changing", "members", "stale", "baseline", "hidden", "crash"] as const;
const ids = { ...users, ...Object.fromEntries(postKeys.map(key => [key, crypto.randomUUID()])) } as typeof users & Record<(typeof postKeys)[number], string>;
const postIds = postKeys.map(key => ids[key]);
type Provider = ContentDependencies["translateTexts"];
const table: string[] = [];

describe.skipIf(!process.env.TR_LEASE_DB)("translation leases against the real database", () => {
  const rpcLog: string[] = [];
  /** One "server": its own handlers over the shared database. `baseline` reproduces the code before leases (claim always granted, plain save). */
  function server(viewer: string, provider: Provider, whole = provider, baseline = false) {
    const translateTexts = vi.fn(provider), translate = vi.fn(async (text: string, locale: never) => (await whole([text], locale))[0]);
    const call = (name: string, args: Record<string, unknown>) => sql(`select public.${name}(${Object.entries(args).map(([key, value]) => `${key} => ${literal(value)}`).join(",")});`);
    const rpc = async (name: string, args: Record<string, unknown>) => {
      rpcLog.push(name);
      if (baseline && name === "claim_content_translation_lease") return { status: "claimed", token: "b0000000-0000-4000-8000-0000000000aa" };
      if (baseline && name.startsWith("save_content_translation") && name.endsWith("_leased")) { const { p_lease_token: _token, ...rest } = args; return call(name.replace("_leased", ""), rest); }
      if (baseline && name === "release_content_translation_lease") return null;
      return call(name, args);
    };
    const deps = { authorize: async () => ({ appUserId: viewer }), authorizeAdmin: vi.fn(), upload: vi.fn(), download: vi.fn(), translate, translateTexts, rpc } as unknown as ContentDependencies;
    return { translateTexts, translate, h: createContentHandlers(deps) };
  }
  type Server = ReturnType<typeof server>;
  const body = (postId: string, slots: boolean, locale = "en") => JSON.stringify({ targetType: "fan_post", targetId: postId, targetLocale: locale, ...(slots ? { slots: "title-body" } : {}) });
  const call = (s: Server, postId: string, slots = true, locale = "en") => s.h.translate(new Request("https://byus.test/api/content-translations", { method: "POST",
    headers: { authorization: "Bearer t", "content-type": "application/json" }, body: body(postId, slots, locale) }));
  const slow = (ms: number, tag: string): Provider => async texts => { await new Promise(resolve => setTimeout(resolve, ms)); return texts.map(text => ({ translatedText: `${tag} ${text}` })); };
  const rows = (postId: string) => sql(`select coalesce(jsonb_agg(slot||':'||translated_text order by slot),'[]') from public.content_translations where target_id=${literal(postId)};`, false);
  const leaseRows = (postId: string) => sql(`select count(*) from public.content_translation_leases where target_id=${literal(postId)};`, false);
  const chars = (s: Server) => s.translateTexts.mock.calls.flatMap(args => args[0]).concat(s.translate.mock.calls.map(args => args[0])).reduce((sum, text) => sum + Array.from(text).length, 0);
  const calls = (servers: Server[]) => servers.reduce((sum, s) => sum + s.translateTexts.mock.calls.length + s.translate.mock.calls.length, 0);

  it("sets up the fixtures", async () => {
    await sql(`begin; insert into public.app_users(id,privy_user_id,verified_email) values (${literal(ids.owner)},'did:privy:lease-db-owner','lease-db-owner@example.test'),(${literal(ids.viewer)},'did:privy:lease-db-viewer','lease-db-viewer@example.test'),(${literal(ids.viewer2)},'did:privy:lease-db-viewer2','lease-db-viewer2@example.test') on conflict do nothing;
      insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values (${literal(ids.artist)},'lease-db-qa','published','/images/creator.webp',now(),'{creator}','creator') on conflict do nothing;
      insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values (${literal(ids.artist)},'ko','리스 DB','소개','사진'),(${literal(ids.artist)},'en','Lease DB','Summary','Photo') on conflict do nothing;
      insert into public.fan_posts(id,celebrity_id,app_user_id,body,visibility,idempotency_key,create_request_hash) values
        ${postIds.map((id, index) => `(${literal(id)},${literal(ids.artist)},${literal(ids.owner)},E'제목 ${index}\\n본문 ${index}',${id === ids.members ? "'members'" : "'public'"},extensions.gen_random_uuid(),'x')`).join(",")} on conflict do nothing; commit;`, false);
  });

  it("C1 six servers ask for the same title/article key at once: the provider is called once, quota is reserved once, every answer is the stored row", async () => {
    const servers = Array.from({ length: 6 }, (_, index) => server(index % 2 ? ids.viewer : ids.viewer2, slow(400, "EN")));
    const reserveBefore = rpcLog.filter(name => name === "reserve_content_translation_request").length;
    const responses = await Promise.all(servers.map(s => call(s, ids.slotsRace)));
    const answers = await Promise.all(responses.map(response => response.json()));
    expect(responses.map(response => response.status)).toEqual([200, 200, 200, 200, 200, 200]);
    expect(calls(servers)).toBe(1);
    expect(rpcLog.filter(name => name === "reserve_content_translation_request").length - reserveBefore).toBe(1);
    expect(new Set(answers.map(answer => JSON.stringify(answer.slots))).size).toBe(1);
    expect(answers.filter(answer => answer.cached === false)).toHaveLength(1);
    expect(await rows(ids.slotsRace)).toEqual(["article:EN 본문 0", "title:EN 제목 0"]); expect(await leaseRows(ids.slotsRace)).toBe(0);
    table.push(`slots   6 concurrent, lease   : provider calls ${calls(servers)}, characters ${servers.reduce((sum, s) => sum + chars(s), 0)}`);
    const again = server(ids.viewer, slow(0, "NEVER")); expect((await call(again, ids.slotsRace)).status).toBe(200);
    expect(calls([again])).toBe(0); expect(rpcLog.slice(-4)).not.toContain("claim_content_translation_lease");
    table.push(`slots   cache hit afterwards  : provider calls 0, characters 0`);
  }, 30_000);

  it("C2 the same race on the whole-text path calls the provider once", async () => {
    const servers = Array.from({ length: 5 }, () => server(ids.viewer, slow(400, "EN")));
    const responses = await Promise.all(servers.map(s => call(s, ids.wholeRace, false)));
    const answers = await Promise.all(responses.map(response => response.json()));
    expect(responses.map(response => response.status)).toEqual([200, 200, 200, 200, 200]);
    expect(calls(servers)).toBe(1); expect(new Set(answers.map(answer => answer.translatedText)).size).toBe(1); expect(answers.filter(answer => answer.cached === false)).toHaveLength(1);
    expect(await leaseRows(ids.wholeRace)).toBe(0);
    table.push(`whole   5 concurrent, lease   : provider calls ${calls(servers)}, characters ${servers.reduce((sum, s) => sum + chars(s), 0)}`);
  }, 30_000);

  it("C3 baseline (no lease, the code before this change): every concurrent server calls the provider", async () => {
    const servers = Array.from({ length: 6 }, (_, index) => server(index % 2 ? ids.viewer : ids.viewer2, slow(400, "EN"), undefined, true));
    const responses = await Promise.all(servers.map(s => call(s, ids.baseline)));
    expect(responses.map(response => response.status)).toEqual([200, 200, 200, 200, 200, 200]);
    expect(calls(servers)).toBeGreaterThan(1);
    table.push(`slots   6 concurrent, baseline: provider calls ${calls(servers)}, characters ${servers.reduce((sum, s) => sum + chars(s), 0)}`);
  }, 30_000);

  it("C4 a changed source revision is translated again once, and the old row is not served", async () => {
    const first = server(ids.viewer, slow(0, "V1")); expect((await call(first, ids.changing)).status).toBe(200); expect(calls([first])).toBe(1);
    await sql(`update public.fan_posts set body=E'바뀐 제목\\n바뀐 본문',revision=revision+1 where id=${literal(ids.changing)};`, false);
    const servers = [server(ids.viewer, slow(200, "V2")), server(ids.viewer2, slow(200, "V2"))];
    const answers = await Promise.all((await Promise.all(servers.map(s => call(s, ids.changing)))).map(response => response.json()));
    expect(calls(servers)).toBe(1); expect(answers.every(answer => answer.slots.title === "V2 바뀐 제목" && answer.sourceRevision === 2)).toBe(true);
    table.push(`slots   revision change       : provider calls ${calls(servers)} (the cached old revision is not reused)`);
  }, 30_000);

  it("C5 a holder whose lease expired cannot overwrite the new holder's row, and gets a conflict", async () => {
    let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
    const slowHolder = server(ids.viewer, async texts => { await gate; return texts.map(text => ({ translatedText: `OLD ${text}` })); });
    const pending = call(slowHolder, ids.stale);
    for (let i = 0; i < 100 && slowHolder.translateTexts.mock.calls.length === 0; i++) await new Promise(resolve => setTimeout(resolve, 50));
    expect(slowHolder.translateTexts).toHaveBeenCalledOnce(); expect(await leaseRows(ids.stale)).toBe(1);
    await sql(`update public.content_translation_leases set expires_at=clock_timestamp()-interval '1 second' where target_id=${literal(ids.stale)};`, false);
    const takeover = server(ids.viewer2, slow(0, "NEW")); const taken = await call(takeover, ids.stale);
    expect(taken.status).toBe(200); expect(calls([takeover])).toBe(1);
    release(); const late = await pending;
    expect(late.status).toBe(409); expect(JSON.stringify(await late.json())).not.toContain("OLD");
    expect(await rows(ids.stale)).toEqual([`article:NEW 본문 ${postKeys.indexOf("stale")}`, `title:NEW 제목 ${postKeys.indexOf("stale")}`]); expect(await leaseRows(ids.stale)).toBe(0);
  }, 30_000);

  it("C6 a holder that crashes without releasing is replaced when its lease expires (waiter polls, then takes over)", async () => {
    await sql(`insert into public.content_translation_leases(target_type,target_id,source_revision,source_hash,source_locale,target_locale,scope,lease_token,expires_at)
      select 'fan_post',id,1,(public.fan_web_content_target(${literal(ids.viewer)},'fan_post',id,'ko')->>'sourceHash'),(public.fan_web_content_target(${literal(ids.viewer)},'fan_post',id,'ko')->>'sourceLocale'),'en','slots',extensions.gen_random_uuid(),clock_timestamp()+interval '2 seconds'
      from public.fan_posts where id=${literal(ids.crash)};`, false);
    const waiter = server(ids.viewer, slow(0, "TAKEN")); const response = await call(waiter, ids.crash);
    expect(response.status).toBe(200); expect(calls([waiter])).toBe(1); expect((await response.json()).cached).toBe(false);
  }, 30_000);

  it("C7 private and hidden sources: 404, the provider is never called, no lease and no row is written", async () => {
    const members = server(ids.viewer, slow(0, "SECRET"));
    for (const slots of [true, false]) expect((await call(members, ids.members, slots)).status).toBe(404);
    await sql(`update public.fan_posts set hidden_at=now() where id=${literal(ids.hidden)};`, false);
    for (const slots of [true, false]) expect((await call(members, ids.hidden, slots)).status).toBe(404);
    expect(calls([members])).toBe(0);
    for (const id of [ids.members, ids.hidden]) { expect(await rows(id)).toEqual([]); expect(await leaseRows(id)).toBe(0); }
    // The same post hidden while the provider works: the answer is 404 and nothing is stored.
    const vanishing = server(ids.owner, async texts => { await sql(`update public.fan_posts set hidden_at=now() where id=${literal(ids.wholeRace)};`, false); return texts.map(text => ({ translatedText: `SECRET ${text}` })); });
    const response = await call(vanishing, ids.wholeRace, true);
    expect(response.status).toBe(404); expect(JSON.stringify(await response.json())).not.toContain("SECRET");
    expect(await leaseRows(ids.wholeRace)).toBe(0);
  }, 30_000);

  it("prints the measurement table and removes the fixtures", async () => {
    console.log(`\nTRANSLATION LEASE MEASUREMENT\n${table.join("\n")}\n`);
    await sql(`begin; delete from public.content_translation_leases where target_id in (${postIds.map(literal).join(",")});
      delete from public.content_translations where target_id in (${postIds.map(literal).join(",")});
      delete from public.content_translation_requests where app_user_id in (${literal(ids.owner)},${literal(ids.viewer)},${literal(ids.viewer2)});
      update public.fan_posts set deleted_at=coalesce(deleted_at,now()) where id in (${postIds.map(literal).join(",")}); commit;`, false);
  });
});
