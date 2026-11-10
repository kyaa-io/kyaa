import { beforeEach, expect, it, vi } from "vitest";
import { AuthError } from "@/features/auth/domain/auth-errors";
vi.mock("server-only", () => ({}));
import { createShortformParticipationHandlers } from "./participation-routes";
const user = "a0000000-0000-4000-8000-000000000001", id = "b0000000-0000-4000-8000-000000000001", video = "U8YzMfHLFQM";
const deps = { authorize: vi.fn(), rpc: vi.fn() };
const handlers = createShortformParticipationHandlers(deps);
const req = (method: string, body?: unknown, auth = false) => new Request("https://kyaa.test/api/shorts/" + video + "/comments?locale=ko", { method, headers: { ...(auth ? { authorization: "Bearer fixture" } : {}), ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
beforeEach(() => { vi.clearAllMocks(); deps.authorize.mockResolvedValue({ appUserId: user }); });
it("reads public reactions and checks the stable video ID", async () => {
 const counts = { reaction: null, likeCount: 1, dislikeCount: 2, commentCount: 3 }; deps.rpc.mockResolvedValue(counts);
 expect(await (await handlers.reaction(req("GET"), video)).json()).toEqual(counts);
 expect(deps.rpc).toHaveBeenCalledWith("read_shortform_participation", { p_video_id: video, p_app_user_id: null });
 expect((await handlers.reaction(req("GET"), "../bad")).status).toBe(400);
});
it("requires authentication for reactions and validates choices", async () => {
 deps.authorize.mockRejectedValueOnce(new AuthError("AUTHENTICATION_REQUIRED", 401, "missing"));
 expect((await handlers.reaction(req("PUT", { reaction: "like" }), video)).status).toBe(401); expect(deps.rpc).not.toHaveBeenCalled();
 expect((await handlers.reaction(req("PUT", { reaction: "other" }, true), video)).status).toBe(400); expect(deps.rpc).not.toHaveBeenCalled();
 deps.rpc.mockResolvedValue({ reaction: "dislike", likeCount: 0, dislikeCount: 1, commentCount: 0 });
 expect((await handlers.reaction(req("PUT", { reaction: "dislike" }, true), video)).status).toBe(200);
 expect(deps.rpc).toHaveBeenCalledWith("set_shortform_reaction", { p_video_id: video, p_app_user_id: user, p_reaction: "dislike" });
});
it("reads comments publicly and writes only validated authenticated comments", async () => {
 deps.rpc.mockResolvedValueOnce({ items: [], hasMore: false }); expect(await (await handlers.comments(req("GET"), video)).json()).toEqual({items: [], nextCursor: null});
 deps.authorize.mockRejectedValueOnce(new AuthError("AUTHENTICATION_REQUIRED", 401, "missing")); expect((await handlers.comments(req("POST", { body: "hello", idempotencyKey: id }), video)).status).toBe(401);
 expect((await handlers.comments(req("POST", { body: " ", idempotencyKey: id }, true), video)).status).toBe(400);
 deps.rpc.mockResolvedValueOnce({ id, revision: 1, replayed: false }); expect((await handlers.comments(req("POST", { body: " hello ", idempotencyKey: id }, true), video)).status).toBe(200);
 expect(deps.rpc).toHaveBeenLastCalledWith("post_shortform_comment", { p_video_id: video, p_app_user_id: user, p_body: "hello", p_idempotency_key: id });
});
it("binds deletion to the authenticated owner", async () => {
 deps.rpc.mockResolvedValue(null); expect(await (await handlers.removeComment(req("DELETE", undefined, true), id)).json()).toEqual({removed: true});
 expect(deps.rpc).toHaveBeenCalledWith("remove_shortform_comment", {p_comment_id: id, p_app_user_id: user});
});
