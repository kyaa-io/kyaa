import { beforeEach, expect, it, vi } from "vitest";
import { AuthError } from "@/features/auth/domain/auth-errors";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ rpc: vi.fn(), authorize: vi.fn() }));
vi.mock("@/server/fanpage/dependencies", () => ({ createFanpageDependencies: () => state }));
import { PUT } from "./route";
const owner = "a0000000-0000-4000-8000-000000000001", context = { params: Promise.resolve({ slug: "service-guide" }) };
const request = () => new Request("https://kyaa.test/api/notices/service-guide/reaction", { method: "PUT", headers: { authorization: "Bearer fixture", "content-type": "application/json" }, body: JSON.stringify({ reaction: "dislike" }) });
beforeEach(() => { vi.clearAllMocks(); state.authorize.mockResolvedValue({ appUserId: owner }); });
it("routes the actual PUT through bearer ownership and response validation", async () => {
  const value = { reaction: "dislike", likeCount: 2, dislikeCount: null, commentCount: 0 };
  state.rpc.mockResolvedValue(value);
  expect(await (await PUT(request(), context)).json()).toEqual(value);
  expect(state.rpc).toHaveBeenCalledExactlyOnceWith("set_home_notice_reaction", { p_slug: "service-guide", p_app_user_id: owner, p_reaction: "dislike" });
});
it("keeps authentication failures before the write", async () => {
  state.authorize.mockRejectedValue(new AuthError("AUTHENTICATION_REQUIRED", 401, "expired"));
  expect((await PUT(request(), context)).status).toBe(401); expect(state.rpc).not.toHaveBeenCalled();
});
