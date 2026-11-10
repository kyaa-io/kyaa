import { beforeEach, expect, it, vi } from "vitest";
import { AuthError } from "@/features/auth/domain/auth-errors";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ rpc: vi.fn(), authorize: vi.fn() }));
vi.mock("@/server/fanpage/dependencies", () => ({ createFanpageDependencies: () => state }));
import { GET, POST } from "./route";
const owner = "a0000000-0000-4000-8000-000000000001", id = "b0000000-0000-4000-8000-000000000001", videoId = "abcdefghijk";
const context = { params: Promise.resolve({ videoId }) };
beforeEach(() => { vi.resetAllMocks(); state.authorize.mockResolvedValue({ appUserId: owner }); });
const request = (body: unknown = { body: " 감사합니다. ", idempotencyKey: id }) => new Request(`https://kyaa.test/api/shorts/${videoId}/comments`, { method: "POST", headers: { authorization: "Bearer fixture", "content-type": "application/json" }, body: JSON.stringify(body) });
it("passes public locale and authenticated comment ownership through real handlers", async () => {
  state.rpc.mockResolvedValueOnce({ items: [], hasMore: false });
  expect(await (await GET(new Request(`https://kyaa.test/api/shorts/${videoId}/comments?locale=en`), context)).json()).toEqual({ items: [], nextCursor: null });
  expect(state.rpc).toHaveBeenCalledWith("read_shortform_comments", { p_video_id: videoId, p_app_user_id: null, p_locale: "en", p_before: null, p_before_id: null });
  state.rpc.mockResolvedValueOnce({ id, revision: 1, replayed: false });
  expect(await (await POST(request(), context)).json()).toEqual({ id, revision: 1, replayed: false });
  expect(state.rpc).toHaveBeenLastCalledWith("post_shortform_comment", { p_video_id: videoId, p_app_user_id: owner, p_body: "감사합니다.", p_idempotency_key: id });
});
it.each([401, 403] as const)("rejects auth status %s before comment creation", async status => {
  state.authorize.mockRejectedValue(new AuthError("AUTHENTICATION_REQUIRED", status, "denied"));
  expect((await POST(request(), context)).status).toBe(status); expect(state.rpc).not.toHaveBeenCalled();
});
it("rejects a caller-supplied owner before comment creation", async () => {
  expect((await POST(request({ body: "hello", idempotencyKey: id, appUserId: owner }), context)).status).toBe(400); expect(state.rpc).not.toHaveBeenCalled();
});
