import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ rpc: vi.fn(), authorizeAdmin: vi.fn() }));
vi.mock("@/server/share-proof/admin", async (original) => { const actual = await original<typeof import("@/server/share-proof/admin")>(); return { ...actual, createShareProofAdminDependencies: () => state }; });
const ADMIN = { appUserId: "55555555-5555-4555-8555-555555555555", allowlistId: "66666666-6666-4666-8666-666666666666" };
const PROOF = "33333333-3333-4333-8333-333333333333";
const auth = { headers: { authorization: "Bearer t" } };
beforeEach(() => { vi.clearAllMocks(); state.authorizeAdmin.mockResolvedValue(ADMIN); });

import { POST } from "./route";
const call = (body: unknown, id = PROOF) => POST(new Request("https://byus.test/x", { method: "POST", body: JSON.stringify(body), ...auth }), { params: Promise.resolve({ id }) });
it("cancels a proof and reports how the grant was taken back", async () => {
  state.rpc.mockResolvedValue({ id: PROOF, replayed: false, result: "corrected" });
  const res = await call({ reason: "본인 게시물 아님" });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ result: { id: PROOF, replayed: false, result: "corrected" } });
  expect(state.rpc).toHaveBeenCalledWith("revoke_fan_share_proof", { p_actor: ADMIN.appUserId, p_allowlist: ADMIN.allowlistId, p_proof_id: PROOF, p_reason: "본인 게시물 아님" });
});
it("answers a second cancel as a replay", async () => {
  state.rpc.mockResolvedValue({ id: PROOF, replayed: true, result: "corrected" });
  expect(await (await call({ reason: "다시 누름" })).json()).toEqual({ result: { id: PROOF, replayed: true, result: "corrected" } });
});
it("refuses a missing reason, a bad id and a member who is not an operator", async () => {
  expect((await call({ reason: "x" })).status).toBe(400);
  expect((await call({ reason: "사유 있음" }, "nope")).status).toBe(400);
  state.rpc.mockRejectedValue(new Error("ADMIN_REQUIRED"));
  expect((await call({ reason: "사유 있음" })).status).toBe(403);
  state.rpc.mockRejectedValue(new Error("SHARE_PROOF_NOT_FOUND"));
  expect((await call({ reason: "사유 있음" })).status).toBe(404);
});
