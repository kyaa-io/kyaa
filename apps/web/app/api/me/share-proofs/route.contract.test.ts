import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ rpc: vi.fn(), authorize: vi.fn() }));
vi.mock("@/server/fanpage/dependencies", () => ({ createFanpageDependencies: () => state }));
vi.mock("@/server/dukjil/creator-id", () => ({ resolveCreatorId: vi.fn(async (slug: string) => slug === "elina" ? "22222222-2222-4222-8222-222222222222" : null) }));

import { GET, POST } from "./route";
const MEMBER = "11111111-1111-4111-8111-111111111111", CELEB = "22222222-2222-4222-8222-222222222222", PROOF = "33333333-3333-4333-8333-333333333333";
const post = (body: unknown) => POST(new Request("https://byus.test/api/me/share-proofs", { method: "POST", body: JSON.stringify(body) }));
const calls = (name: string) => state.rpc.mock.calls.filter(([called]) => called === name);
beforeEach(() => { vi.clearAllMocks(); state.authorize.mockResolvedValue({ appUserId: MEMBER }); });

function answers(map: Record<string, unknown>) { state.rpc.mockImplementation(async (name: string) => { const value = map[name]; if (value instanceof Error) throw value; return value; }); }

const IG = "C1aBc_D-2xY", XURL = "https://x.com/fan/status/1850000000000000001";
const stored = (extra: Record<string, unknown> = {}) => ({ id: PROOF, replayed: false, points: null, status: "accepted", ...extra });

it("stores the checked post with the fan's confirmation, pays the share mission and answers the one reward shape", async () => {
  answers({ submit_fan_share_proof: stored(), record_dukjil_action: { points: 10, stampId: "44444444-4444-4444-8444-444444444444", capped: false, reason: null, replayed: false }, set_fan_share_proof_points: null });
  const res = await post({ creator: "elina", url: `https://www.instagram.com/reel/${IG}/?utm_source=x`, ownPost: true });
  expect(res.status).toBe(201);
  expect(await res.json()).toEqual({ id: PROOF, replayed: false, reward: { points: 10, stamps: 1 } });
  expect(calls("submit_fan_share_proof")[0][1]).toEqual({ p_app_user_id: MEMBER, p_celebrity_id: CELEB, p_platform: "instagram", p_url: `https://www.instagram.com/reel/${IG}/`, p_url_key: `instagram:${IG}`, p_own_post: true });
  expect(calls("record_dukjil_action")[0][1]).toMatchObject({ p_user: MEMBER, p_celebrity: CELEB, p_action_key: "share", p_source_key: `share-proof:${PROOF}` });
  expect(calls("set_fan_share_proof_points")[0][1]).toEqual({ p_app_user_id: MEMBER, p_id: PROOF, p_points: 10 });
});
it("refuses a submission without the own-post confirmation before the database", async () => {
  for (const body of [{ creator: "elina", url: XURL }, { creator: "elina", url: XURL, ownPost: false }]) {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: { code: "SHARE_PROOF_OWN_POST_REQUIRED" } });
  }
  expect(state.rpc).not.toHaveBeenCalled();
});
it("says the shared daily cap was reached with points 0", async () => {
  answers({ submit_fan_share_proof: stored(), record_dukjil_action: new Error("DUKJIL_DAILY_LIMIT"), set_fan_share_proof_points: null });
  expect(await (await post({ creator: "elina", url: XURL, ownPost: true })).json()).toEqual({ id: PROOF, replayed: false, reward: { points: 0, stamps: 0, skippedReason: "daily_limit" } });
});
it("replays a paid or cancelled proof without paying, and pays a stored proof whose payout never ran", async () => {
  for (const extra of [{ replayed: true, points: 10 }, { replayed: true, points: null, status: "revoked" }]) {
    answers({ submit_fan_share_proof: stored(extra) });
    expect(await (await post({ creator: "elina", url: XURL, ownPost: true })).json()).toEqual({ id: PROOF, replayed: true });
  }
  expect(calls("record_dukjil_action")).toHaveLength(0);
  answers({ submit_fan_share_proof: stored({ replayed: true }), record_dukjil_action: { points: 10, stampId: null, capped: false, reason: null, replayed: false }, set_fan_share_proof_points: null });
  const res = await post({ creator: "elina", url: XURL, ownPost: true });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ id: PROOF, replayed: true, reward: { points: 10, stamps: 0 } });
});
it.each([
  ["https://www.instagram.com/elina_official/", "SHARE_PROOF_URL_NOT_POST"],
  ["https://x.com/i/status/1", "SHARE_PROOF_URL_NOT_POST"],
  ["https://vm.tiktok.com/ZMabc123/", "SHARE_PROOF_URL_SHORT"],
  ["https://www.facebook.com/fan/posts/1234567890", "SHARE_PROOF_URL_UNSUPPORTED"],
])("refuses %s before the database (%s)", async (url, code) => {
  const res = await post({ creator: "elina", url, ownPost: true });
  expect(res.status).toBe(422);
  expect(await res.json()).toEqual({ error: { code } });
  expect(state.rpc).not.toHaveBeenCalled();
});
it("maps the database refusals", async () => {
  answers({ submit_fan_share_proof: new Error("PASSPORT_REQUIRED") });
  expect((await post({ creator: "elina", url: XURL, ownPost: true })).status).toBe(403);
  expect((await post({ creator: "nobody", url: XURL, ownPost: true })).status).toBe(404);
});
it("lists the fan's own proofs of a creator, cancelled ones marked", async () => {
  const items = [{ id: PROOF, platform: "x", url: XURL, points: 10, createdAt: "2026-11-08T09:48:11.461007+09:00", status: "revoked" }];
  answers({ list_fan_share_proofs: { items } });
  const res = await GET(new Request("https://byus.test/api/me/share-proofs?creator=elina"));
  expect(await res.json()).toEqual({ items });
  expect(calls("list_fan_share_proofs")[0][1]).toEqual({ p_app_user_id: MEMBER, p_celebrity_id: CELEB });
});
