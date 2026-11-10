import { beforeEach, expect, it, vi } from "vitest";
import { AuthError } from "@/features/auth/domain/auth-errors";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ rpc: vi.fn(), authorize: vi.fn() }));
vi.mock("@/server/fanpage/dependencies", () => ({ createFanpageDependencies: () => state }));
import { DELETE } from "./route";
const owner = "a0000000-0000-4000-8000-000000000001", id = "b0000000-0000-4000-8000-000000000001";
const context = { params: Promise.resolve({ id }) };
const request = () => new Request(`https://kyaa.test/api/short-comments/${id}`, { method: "DELETE", headers: { authorization: "Bearer fixture" } });
beforeEach(() => { vi.resetAllMocks(); state.authorize.mockResolvedValue({ appUserId: owner }); });
it("binds actual deletion to the authenticated owner", async () => {
  state.rpc.mockResolvedValue(null);
  expect(await (await DELETE(request(), context)).json()).toEqual({ removed: true });
  expect(state.rpc).toHaveBeenCalledExactlyOnceWith("remove_shortform_comment", { p_comment_id: id, p_app_user_id: owner });
});
it.each([401, 403] as const)("rejects auth status %s before deletion", async status => {
  state.authorize.mockRejectedValue(new AuthError("AUTHENTICATION_REQUIRED", status, "denied"));
  expect((await DELETE(request(), context)).status).toBe(status); expect(state.rpc).not.toHaveBeenCalled();
});
it("preserves the owner-only RPC refusal without claiming deletion", async () => {
  state.rpc.mockRejectedValue(new Error("FAN_WEB_NOT_FOUND"));
  expect((await DELETE(request(), context)).status).toBe(404);
});
