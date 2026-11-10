import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ rpc: vi.fn(), authorizeAdmin: vi.fn() }));
vi.mock("@/server/share-proof/admin", async (original) => { const actual = await original<typeof import("@/server/share-proof/admin")>(); return { ...actual, createShareProofAdminDependencies: () => state }; });
const ADMIN = { appUserId: "55555555-5555-4555-8555-555555555555", allowlistId: "66666666-6666-4666-8666-666666666666" };
const PROOF = "33333333-3333-4333-8333-333333333333", MEMBER = "11111111-1111-4111-8111-111111111111", CELEB = "22222222-2222-4222-8222-222222222222";
const auth = { headers: { authorization: "Bearer t" } };
beforeEach(() => { vi.clearAllMocks(); state.authorizeAdmin.mockResolvedValue(ADMIN); });

import { POST } from "./route";
const call = (body: unknown, id = PROOF) => POST(new Request("https://byus.test/x", { method: "POST", body: JSON.stringify(body), ...auth }), { params: Promise.resolve({ id }) });
const decided = (extra: Record<string, unknown> = {}) => ({ id: PROOF, status: "accepted", replayed: false, revision: 0, appUserId: MEMBER, platform: "instagram", creatorId: CELEB, creatorSlug: "elina", ...extra });
const calls = (name: string) => state.rpc.mock.calls.filter(([called]) => called === name);
function answers(map: Record<string, unknown>) { state.rpc.mockImplementation(async (name: string) => { const value = map[name]; if (value instanceof Error) throw value; return value; }); }

it("accepts a pending proof and pays it under the proof's lock, only for networks whose official account is known", async () => {
  answers({ review_fan_share_proof: decided(), pay_fan_share_proof: { points: 10, stampId: null, capped: false, reason: null, replayed: false } });
  const res = await call({ decision: "accept", revision: 0 });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ result: { id: PROOF, status: "accepted", replayed: false, reward: { points: 10 } } });
  expect(calls("review_fan_share_proof")[0][1]).toEqual({ p_actor: ADMIN.appUserId, p_allowlist: ADMIN.allowlistId, p_id: PROOF, p_expected_revision: 0, p_decision: "accept", p_reject_code: null, p_tag_platforms: ["instagram", "x", "threads"] });
  expect(calls("pay_fan_share_proof")[0][1]).toMatchObject({ p_app_user_id: MEMBER, p_proof_id: PROOF, p_params: { platform: "instagram" } });
});
it("rejects without paying and keeps the reason code", async () => {
  answers({ review_fan_share_proof: decided({ status: "rejected" }) });
  expect(await (await call({ decision: "reject", revision: 0, rejectCode: "no_hashtag" })).json()).toEqual({ result: { id: PROOF, status: "rejected", replayed: false } });
  expect(calls("review_fan_share_proof")[0][1]).toMatchObject({ p_decision: "reject", p_reject_code: "no_hashtag" });
  expect(calls("pay_fan_share_proof")).toHaveLength(0);
});
it("closes the proof at 0P when the daily cap refuses the payout, and leaves it open after a transient failure", async () => {
  answers({ review_fan_share_proof: decided(), pay_fan_share_proof: new Error("DUKJIL_DAILY_LIMIT"), set_fan_share_proof_points: null });
  expect((await (await call({ decision: "accept", revision: 0 })).json()).result.reward).toEqual({ points: 0, skippedReason: "daily_limit" });
  expect(calls("set_fan_share_proof_points")[0][1]).toEqual({ p_app_user_id: MEMBER, p_id: PROOF, p_points: 0 });
  vi.clearAllMocks(); state.authorizeAdmin.mockResolvedValue(ADMIN);
  answers({ review_fan_share_proof: decided({ replayed: true }), pay_fan_share_proof: new Error("connection reset"), record_dukjil_award_failure: null });
  const res = await call({ decision: "accept", revision: 0 });
  expect((await res.json()).result).toEqual({ id: PROOF, status: "accepted", replayed: true, reward: { points: 0 } });
  expect(calls("set_fan_share_proof_points")).toHaveLength(0);
});
it("refuses a network without a confirmed official account, a stale revision, a bad body and a member who is not an operator", async () => {
  answers({ review_fan_share_proof: new Error("SHARE_TAG_HANDLE_UNCONFIRMED") });
  expect((await call({ decision: "accept", revision: 0 })).status).toBe(409);
  answers({ review_fan_share_proof: new Error("REVIEW_STALE") });
  expect((await call({ decision: "accept", revision: 0 })).status).toBe(409);
  expect(calls("pay_fan_share_proof")).toHaveLength(0);
  expect((await call({ decision: "reject", revision: 0 })).status).toBe(400);
  expect((await call({ decision: "accept", revision: 0 }, "nope")).status).toBe(400);
  answers({ review_fan_share_proof: new Error("ADMIN_REQUIRED") });
  expect((await call({ decision: "accept", revision: 0 })).status).toBe(403);
  answers({ review_fan_share_proof: new Error("SELF_REVIEW_FORBIDDEN") });
  expect((await call({ decision: "accept", revision: 0 })).status).toBe(403);
});
