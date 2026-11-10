import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { Client } from "pg";
import { createShareProofHandlers } from "./routes";
import { shareProofAdminRoutes } from "./admin";

/**
 * Real handlers against a real database. Skipped unless BYUS_SHARE_TAG_DB=1 (and the PG* environment points at a disposable clean-chain
 * database that ran supabase/tests/share_tag_concurrency.sh, whose committed fixtures this reads). Run by the isolated chain, not by the unit run.
 */
const enabled = process.env.BYUS_SHARE_TAG_DB === "1";
const ADMIN = { appUserId: "b3e00000-0000-4000-8000-000000000010", allowlistId: "b3e00000-0000-4000-8000-000000000020", email: "b3e-adm@byus.test", role: "admin" as const };
const MEMBER = "b3e00000-0000-4000-8000-000000000120", OTHER = "b3e00000-0000-4000-8000-000000000121", EMPTY = "b3e00000-0000-4000-8000-000000000122";
const SLUG = "b3-share-conc";
let db: Client;
beforeAll(async () => { if (enabled) { db = new Client(); await db.connect(); } });
afterAll(async () => { if (enabled) await db.end(); });

const rpc = async (name: string, args: Record<string, unknown>) => {
  const keys = Object.keys(args);
  const values = keys.map(key => { const value = args[key]; return value !== null && typeof value === "object" && !Array.isArray(value) ? JSON.stringify(value) : value; });
  const { rows } = await db.query(`select public.${name}(${keys.map((key, i) => `${key} => $${i + 1}`).join(", ")}) as r`, values);
  return rows[0].r;
};
const creatorId = async (slug: string) => (await db.query("select id from public.celebrities where slug = $1", [slug])).rows[0]?.id ?? null;
const member = (appUserId: string) => createShareProofHandlers({ rpc, authorize: async () => ({ appUserId }), resolveCreatorId: creatorId });
const admin = { rpc, authorizeAdmin: async () => ADMIN as never };
const req = (path: string, body?: unknown) => new Request(`https://byus.test${path}`, { method: body === undefined ? "GET" : "POST", headers: { authorization: "Bearer t", "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const submit = (who: string, url: string) => member(who).submit(req("/api/me/share-proofs", { creator: SLUG, url, ownPost: true }));
const grants = async (id: string) => Number((await db.query("select count(*) from public.dukjil_action_log where action_key = 'share' and source_key = $1", [`share-proof:${id}`])).rows[0].count);

describe.skipIf(!enabled)("share tag review through the real routes and database", () => {
  it("submit pays nothing, a second member is refused, accept pays once, a repeat accept is stale", async () => {
    const url = "https://x.com/fan/status/1880000000000000001";
    const first = await submit(MEMBER, url);
    expect(first.status).toBe(201);
    const body = await first.json();
    expect(body).toMatchObject({ replayed: false, status: "pending" });
    expect(await grants(body.id)).toBe(0);
    const taken = await submit(OTHER, url.replace("x.com/fan", "twitter.com/Other"));
    expect(taken.status).toBe(409);
    expect(await taken.json()).toEqual({ error: { code: "SHARE_PROOF_URL_REUSED" } });
    const listed = await (await member(MEMBER).list(req(`/api/me/share-proofs?creator=${SLUG}`))).json();
    expect(listed.items.find((item: { id: string }) => item.id === body.id)).toMatchObject({ status: "pending", points: null });
    const queue = await (await shareProofAdminRoutes.list(admin)(req("/api/admin/share-proofs"))).json();
    expect(queue.items.find((item: { id: string }) => item.id === body.id)).toMatchObject({ status: "pending", revision: 0, rejectCode: null });
    const accepted = await shareProofAdminRoutes.review(admin)(req("/x", { decision: "accept", revision: 0 }), { id: body.id });
    expect(accepted.status).toBe(200);
    const result = (await accepted.json()).result;
    expect(result).toMatchObject({ id: body.id, status: "accepted", replayed: false });
    expect(result.reward.points).toBeGreaterThan(0);
    expect(await grants(body.id)).toBe(1);
    const again = await shareProofAdminRoutes.review(admin)(req("/x", { decision: "accept", revision: 0 }), { id: body.id });
    expect(again.status).toBe(409);
    expect(await grants(body.id)).toBe(1);
  });
  it("a network without a confirmed official account stays pending; a rejected proof can be fixed and sent again", async () => {
    const tiktok = await (await submit(MEMBER, "https://www.tiktok.com/@fan/video/7440000000000000001")).json();
    const refused = await shareProofAdminRoutes.review(admin)(req("/x", { decision: "accept", revision: 0 }), { id: tiktok.id });
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({ error: { code: "SHARE_TAG_HANDLE_UNCONFIRMED" } });
    expect((await db.query("select status from public.fan_share_proofs where id = $1", [tiktok.id])).rows[0].status).toBe("pending");
    const post = "https://www.instagram.com/p/IntegTag001/";
    const sent = await (await submit(MEMBER, post)).json();
    const rejected = await shareProofAdminRoutes.review(admin)(req("/x", { decision: "reject", revision: 0, rejectCode: "no_hashtag" }), { id: sent.id });
    expect((await rejected.json()).result).toMatchObject({ status: "rejected" });
    expect(await grants(sent.id)).toBe(0);
    const resent = await submit(MEMBER, post);
    expect(await resent.json()).toMatchObject({ id: sent.id, status: "pending", replayed: false });
    expect((await db.query("select review_revision from public.fan_share_proofs where id = $1", [sent.id])).rows[0].review_revision).toBe(1);
    const stale = await shareProofAdminRoutes.review(admin)(req("/x", { decision: "accept", revision: 0 }), { id: sent.id });
    expect(stale.status).toBe(409);
  });
  it("a member with no proofs gets an empty list", async () => {
    const res = await member(EMPTY).list(req(`/api/me/share-proofs?creator=${SLUG}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [] });
  });
  it("a non-operator cannot review", async () => {
    const proof = await (await submit(OTHER, "https://x.com/fan/status/1880000000000000009")).json();
    const outsider = { rpc, authorizeAdmin: async () => ({ ...ADMIN, appUserId: MEMBER }) as never };
    const res = await shareProofAdminRoutes.review(outsider)(req("/x", { decision: "accept", revision: 0 }), { id: proof.id });
    expect(res.status).toBe(403);
    expect((await db.query("select status from public.fan_share_proofs where id = $1", [proof.id])).rows[0].status).toBe("pending");
  });
});
