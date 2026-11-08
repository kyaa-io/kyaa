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

it("stores the checked post, pays the share mission once and answers the grant", async () => {
  answers({ submit_fan_share_proof: { id: PROOF, replayed: false }, record_dukjil_action: { points: 10, stampId: "44444444-4444-4444-8444-444444444444", capped: false, reason: null, replayed: false }, set_fan_share_proof_points: null });
  const res = await post({ creator: "elina", url: "https://www.instagram.com/p/C1abc/?utm_source=x" });
  expect(res.status).toBe(201);
  expect(await res.json()).toEqual({ id: PROOF, replayed: false, reward: { points: 10, stamps: 1 } });
  expect(calls("submit_fan_share_proof")[0][1]).toEqual({ p_app_user_id: MEMBER, p_celebrity_id: CELEB, p_platform: "instagram", p_url: "https://www.instagram.com/p/C1abc/", p_url_key: "instagram:p/c1abc" });
  expect(calls("record_dukjil_action")[0][1]).toMatchObject({ p_user: MEMBER, p_celebrity: CELEB, p_action_key: "share", p_source_key: `share-proof:${PROOF}` });
  expect(calls("set_fan_share_proof_points")[0][1]).toEqual({ p_app_user_id: MEMBER, p_id: PROOF, p_points: 10 });
});
it("says the daily cap was reached instead of a grant", async () => {
  answers({ submit_fan_share_proof: { id: PROOF, replayed: false }, record_dukjil_action: new Error("DUKJIL_DAILY_LIMIT"), set_fan_share_proof_points: null });
  expect(await (await post({ creator: "elina", url: "https://x.com/a/status/1" })).json()).toEqual({ id: PROOF, replayed: false, rewardSkipped: "daily_limit" });
});
it("replays a paid proof without paying, and pays a stored proof whose payout never ran", async () => {
  answers({ submit_fan_share_proof: { id: PROOF, replayed: true, points: 10 } });
  expect(await (await post({ creator: "elina", url: "https://x.com/a/status/1" })).json()).toEqual({ id: PROOF, replayed: true });
  expect(calls("record_dukjil_action")).toHaveLength(0);
  answers({ submit_fan_share_proof: { id: PROOF, replayed: true, points: null }, record_dukjil_action: { points: 10, stampId: null, capped: false, reason: null, replayed: false }, set_fan_share_proof_points: null });
  const res = await post({ creator: "elina", url: "https://x.com/a/status/1" });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ id: PROOF, replayed: true, reward: { points: 10 } });
});
it("refuses a profile address before the database, and maps the database refusals", async () => {
  expect((await post({ creator: "elina", url: "https://www.instagram.com/elina_official/" })).status).toBe(422);
  expect(state.rpc).not.toHaveBeenCalled();
  answers({ submit_fan_share_proof: new Error("SHARE_PROOF_URL_USED") });
  expect(await (await post({ creator: "elina", url: "https://x.com/a/status/1" })).json()).toEqual({ error: { code: "SHARE_PROOF_URL_USED" } });
  answers({ submit_fan_share_proof: new Error("PASSPORT_REQUIRED") });
  expect((await post({ creator: "elina", url: "https://x.com/a/status/1" })).status).toBe(403);
  expect((await post({ creator: "nobody", url: "https://x.com/a/status/1" })).status).toBe(404);
});
it("lists the fan's own proofs of a creator", async () => {
  const items = [{ id: PROOF, platform: "x", url: "https://x.com/fan/status/1", points: 10, createdAt: "2026-11-08T09:48:11.461007+09:00" }];
  answers({ list_fan_share_proofs: { items } });
  const res = await GET(new Request("https://byus.test/api/me/share-proofs?creator=elina"));
  expect(await res.json()).toEqual({ items });
  expect(calls("list_fan_share_proofs")[0][1]).toEqual({ p_app_user_id: MEMBER, p_celebrity_id: CELEB });
});
