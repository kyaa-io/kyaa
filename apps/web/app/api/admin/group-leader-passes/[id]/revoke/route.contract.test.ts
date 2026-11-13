import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ rpc: vi.fn(), authorize: vi.fn(), authorizeAdmin: vi.fn() }));
vi.mock("@/server/fanpage/dependencies", () => ({ createFanpageDependencies: () => state }));
import { POST } from "./route";
const id = "33333333-3333-4333-8333-333333333333";
const req = () => new Request("https://kyaa.test/api/admin/group-leader-passes/x/revoke", { method: "POST", headers: { authorization: "Bearer admin", "content-type": "application/json" }, body: "{}" });
beforeEach(() => { vi.clearAllMocks(); process.env.KYAA_GROUPS_ENABLED = "true"; state.authorizeAdmin.mockResolvedValue({ appUserId: "11111111-1111-4111-8111-111111111111", allowlistId: "22222222-2222-4222-8222-222222222222", role: "admin", email: "a@example.com" }); });
it("revokes by id for a writer and maps a used pass to 409", async () => {
  state.rpc.mockResolvedValueOnce({ id, status: "revoked" });
  expect((await POST(req(), { params: Promise.resolve({ id }) })).status).toBe(200);
  expect(state.rpc).toHaveBeenLastCalledWith("group_leader_pass_revoke", expect.objectContaining({ p_id: id }));
  state.rpc.mockRejectedValueOnce(new Error("GROUPS_CONFLICT"));
  expect((await POST(req(), { params: Promise.resolve({ id }) })).status).toBe(409);
});
it("refuses a non-uuid id before SQL", async () => {
  expect((await POST(req(), { params: Promise.resolve({ id: "nope" }) })).status).toBe(400);
  expect(state.rpc).not.toHaveBeenCalled();
});
