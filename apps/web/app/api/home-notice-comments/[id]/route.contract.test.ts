import { beforeEach, expect, it, vi } from "vitest";
import { AuthError } from "@/features/auth/domain/auth-errors";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ rpc: vi.fn(), authorize: vi.fn() }));
vi.mock("@/server/fanpage/dependencies", () => ({ createFanpageDependencies: () => state }));
import { DELETE } from "./route";
const owner = "a0000000-0000-4000-8000-000000000001", id = "b0000000-0000-4000-8000-000000000001";
const context = { params: Promise.resolve({ id }) };
const request = () => new Request(`https://kyaa.test/api/home-notice-comments/${id}`, { method: "DELETE", headers: { authorization: "Bearer fixture" } });
beforeEach(() => { vi.clearAllMocks(); state.authorize.mockResolvedValue({ appUserId: owner }); });
it("passes the awaited id and authenticated owner into the real deletion handler", async () => {
  state.rpc.mockResolvedValue(null);
  const response = await DELETE(request(), context);
  expect(await response.json()).toEqual({ removed: true });
  expect(state.rpc).toHaveBeenCalledExactlyOnceWith("remove_home_notice_comment", { p_comment_id: id, p_app_user_id: owner });
});
it("rejects invalid credentials before deletion", async () => {
  state.authorize.mockRejectedValue(new AuthError("AUTHENTICATION_REQUIRED", 401, "expired"));
  expect((await DELETE(request(), context)).status).toBe(401); expect(state.rpc).not.toHaveBeenCalled();
});
