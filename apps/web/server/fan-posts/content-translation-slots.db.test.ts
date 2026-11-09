// Real SQL behind the real route (provider faked). Runs only against a disposable database that has 20261220000000_content_translation_slots
// applied: set TR_TITLE_DB=1 with PGHOST (socket directory), PGPORT and PGDATABASE pointing at it. Rows it adds stay in that database.
import { spawn } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createContentHandlers, type ContentDependencies } from "./routes";
import { slotTranslationSchema } from "@/features/fan-posts/domain/content";

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
const ids = { owner: "ac280000-0000-4000-8000-000000000001", viewer: "ac280000-0000-4000-8000-000000000002", artist: "ac280000-0000-4000-8000-000000000004",
  fresh: "ac280000-0000-4000-8000-000000000010", racing: "ac280000-0000-4000-8000-000000000011", members: "ac280000-0000-4000-8000-000000000012" };

describe.skipIf(!process.env.TR_TITLE_DB)("title/article translation against the real database", () => {
  function handlers(viewer: string, provider: ContentDependencies["translateTexts"]) {
    const deps = { authorize: async () => ({ appUserId: viewer }), authorizeAdmin: vi.fn(), upload: vi.fn(), download: vi.fn(), translate: vi.fn(), translateTexts: vi.fn(provider),
      rpc: (name: string, args: Record<string, unknown>) => sql(`select public.${name}(${Object.entries(args).map(([key, value]) => `${key} => ${literal(value)}`).join(",")});`) } as unknown as ContentDependencies;
    return { deps, h: createContentHandlers(deps) };
  }
  const call = (h: ReturnType<typeof handlers>["h"], postId: string) => h.translate(new Request("https://byus.test/api/content-translations", { method: "POST", headers: { authorization: "Bearer t", "content-type": "application/json" },
    body: JSON.stringify({ targetType: "fan_post", targetId: postId, targetLocale: "en", slots: "title-body" }) }));
  const rows = (postId: string) => sql(`select coalesce(jsonb_agg(slot order by slot),'[]') from public.content_translations where target_id=${literal(postId)};`, false);

  it("sets up the fixtures", async () => {
    await sql(`begin; insert into public.app_users(id,privy_user_id,verified_email) values (${literal(ids.owner)},'did:privy:slots-db-owner','slots-db-owner@example.test'),(${literal(ids.viewer)},'did:privy:slots-db-viewer','slots-db-viewer@example.test') on conflict do nothing;
      insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values (${literal(ids.artist)},'slots-db-qa','published','/images/creator.webp',now(),'{creator}','creator') on conflict do nothing;
      insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values (${literal(ids.artist)},'ko','슬롯 DB','소개','사진'),(${literal(ids.artist)},'en','Slots DB','Summary','Photo') on conflict do nothing;
      insert into public.fan_posts(id,celebrity_id,app_user_id,body,visibility,idempotency_key,create_request_hash) values
        (${literal(ids.fresh)},${literal(ids.artist)},${literal(ids.owner)},E'제목입니다\\n본문입니다','public',extensions.gen_random_uuid(),'x'),
        (${literal(ids.racing)},${literal(ids.artist)},${literal(ids.owner)},E'경쟁 제목\\n경쟁 본문','public',extensions.gen_random_uuid(),'x'),
        (${literal(ids.members)},${literal(ids.artist)},${literal(ids.owner)},E'회원 제목\\n회원 본문','members',extensions.gen_random_uuid(),'x') on conflict do nothing; commit;`, false);
  });
  it("L1 a post without translations: miss, save, re-read through the response schema; the same call again is a hit", async () => {
    const { deps, h } = handlers(ids.viewer, async texts => texts.map(text => ({ translatedText: `EN ${text}` })));
    const first = await call(h, ids.fresh), firstBody = await first.json();
    expect(first.status).toBe(200); expect(slotTranslationSchema.parse(firstBody)).toMatchObject({ cached: false, slots: { title: "EN 제목입니다", article: "EN 본문입니다" } });
    expect(deps.translateTexts).toHaveBeenCalledTimes(1);
    const second = await call(h, ids.fresh), secondBody = await second.json();
    expect(second.status).toBe(200); expect(slotTranslationSchema.parse(secondBody)).toMatchObject({ cached: true, slots: firstBody.slots });
    expect(deps.translateTexts).toHaveBeenCalledTimes(1);
    expect(await rows(ids.fresh)).toEqual(["article", "title"]);
  });
  it("L2 the post is hidden while the provider works: 404, no rows, no translated text", async () => {
    const { h } = handlers(ids.viewer, async texts => { await sql(`update public.fan_posts set hidden_at=now() where id=${literal(ids.racing)};`, false); return texts.map(text => ({ translatedText: `SECRET ${text}` })); });
    const response = await call(h, ids.racing);
    expect(response.status).toBe(404); expect(JSON.stringify(await response.json())).not.toContain("SECRET");
    expect(await rows(ids.racing)).toEqual([]);
  });
  it("L3 a non-member asking for a members-only post gets 404 and the provider is never called", async () => {
    const { deps, h } = handlers(ids.viewer, async texts => texts.map(text => ({ translatedText: text })));
    expect((await call(h, ids.members)).status).toBe(404);
    expect(deps.translateTexts).not.toHaveBeenCalled(); expect(await rows(ids.members)).toEqual([]);
  });
});
