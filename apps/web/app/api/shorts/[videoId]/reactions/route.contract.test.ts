import { beforeEach, expect, it, vi } from "vitest";
import { AuthError } from "@/features/auth/domain/auth-errors";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ rpc: vi.fn(), authorize: vi.fn() }));
vi.mock("@/server/fanpage/dependencies", () => ({ createFanpageDependencies: () => state }));
import { GET, PUT } from "./route";
const owner = "a0000000-0000-4000-8000-000000000001", id = "b0000000-0000-4000-8000-000000000001", videoId = "abcdefghijk";
const context = { params: Promise.resolve({ videoId }) };
beforeEach(() => { vi.resetAllMocks(); state.authorize.mockResolvedValue({ appUserId: owner }); });
const request = (reaction: unknown = "like") => new Request(`https://kyaa.test/api/shorts/${videoId}/reactions`, { method: "PUT", headers: { authorization: "Bearer fixture", "content-type": "application/json" }, body: JSON.stringify({ reaction }) });
it("uses the authenticated owner and validates the actual PUT response", async () => {
  const value = { reaction: "like", likeCount: 1, dislikeCount: 0, commentCount: 0 };
  state.rpc.mockResolvedValue(value);
  expect(await (await PUT(request(), context)).json()).toEqual(value);
  expect(state.rpc).toHaveBeenCalledExactlyOnceWith("set_shortform_reaction", { p_video_id: videoId, p_app_user_id: owner, p_reaction: "like" });
});
it.each([401, 403] as const)("rejects auth status %s before the write", async status => {
  state.authorize.mockRejectedValue(new AuthError("AUTHENTICATION_REQUIRED", status, "denied"));
  expect((await PUT(request(), context)).status).toBe(status); expect(state.rpc).not.toHaveBeenCalled();
});
it("rejects invalid reaction input before the write", async () => {
  expect((await PUT(request("other"), context)).status).toBe(400); expect(state.rpc).not.toHaveBeenCalled();
});
it("preserves the public read path without treating a forged bearer as anonymous", async () => {
  state.rpc.mockResolvedValue({ reaction: null, likeCount: 0, dislikeCount: 0, commentCount: 0 });
  expect((await GET(new Request(`https://kyaa.test/api/shorts/${videoId}/reactions`), context)).status).toBe(200);
  expect(state.rpc).toHaveBeenCalledWith("read_shortform_participation", { p_video_id: videoId, p_app_user_id: null });
  state.rpc.mockClear(); state.authorize.mockRejectedValue(new AuthError("AUTHENTICATION_REQUIRED", 401, "invalid"));
  expect((await GET(request(), context)).status).toBe(401); expect(state.rpc).not.toHaveBeenCalled();
});
