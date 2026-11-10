import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ rpc: vi.fn(), authorizeAdmin: vi.fn() }));
vi.mock("@/server/share-proof/admin", async (original) => { const actual = await original<typeof import("@/server/share-proof/admin")>(); return { ...actual, createShareProofAdminDependencies: () => state }; });
const ADMIN = { appUserId: "55555555-5555-4555-8555-555555555555", allowlistId: "66666666-6666-4666-8666-666666666666" };
const PROOF = "33333333-3333-4333-8333-333333333333";
const auth = { headers: { authorization: "Bearer t" } };
beforeEach(() => { vi.clearAllMocks(); state.authorizeAdmin.mockResolvedValue(ADMIN); });

import { GET } from "./route";
const row = { id: PROOF, createdAt: "2026-11-08T10:00:00+09:00", status: "accepted", platform: "x", url: "https://x.com/fan/status/1850000000000000001", postId: "1850000000000000001", points: 10,
  creator: { slug: "elina", name: "엘리나" }, member: { id: "11111111-1111-4111-8111-111111111111", nickname: "팬" }, duplicateCount: 1, revision: 0, rejectCode: null, revokedAt: null, revokeResult: null };
it("lists share proofs for an operator with the duplicate mark", async () => {
  state.rpc.mockResolvedValue({ items: [row] });
  const res = await GET(new Request("https://byus.test/api/admin/share-proofs?status=all", auth));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ items: [row], hasMore: false });
  expect(state.rpc).toHaveBeenCalledWith("read_admin_share_proofs", { p_actor: ADMIN.appUserId, p_allowlist: ADMIN.allowlistId, p_status: "all", p_before: null, p_limit: 50 });
});
it("refuses without a token, a bad filter, or a member who is not an operator", async () => {
  expect((await GET(new Request("https://byus.test/api/admin/share-proofs"))).status).toBe(401);
  expect((await GET(new Request("https://byus.test/api/admin/share-proofs?status=bogus", auth))).status).toBe(400);
  state.rpc.mockRejectedValue(new Error("ADMIN_REQUIRED"));
  expect((await GET(new Request("https://byus.test/api/admin/share-proofs", auth))).status).toBe(403);
});
it("shows the proofs waiting for a decision unless another filter is asked for", async () => {
  state.rpc.mockResolvedValue({ items: [{ ...row, status: "pending", points: null }] });
  expect((await GET(new Request("https://byus.test/api/admin/share-proofs", auth))).status).toBe(200);
  expect(state.rpc).toHaveBeenCalledWith("read_admin_share_proofs", expect.objectContaining({ p_status: "pending" }));
});
