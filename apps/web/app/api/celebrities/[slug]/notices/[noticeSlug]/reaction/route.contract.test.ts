import { beforeEach, expect, it, vi } from "vitest";
import { AuthError } from "@/features/auth/domain/auth-errors";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ rpc: vi.fn(), authorize: vi.fn() }));
vi.mock("@/server/fanpage/dependencies", () => ({ createFanpageDependencies: () => state }));
import { GET, PUT } from "./route";
const owner = "a0000000-0000-4000-8000-000000000001";
const context = { params: Promise.resolve({ slug: "elina", noticeSlug: "artist-news" }) };
const url = "https://kyaa.test/api/celebrities/elina/notices/artist-news/reaction?locale=ko";
const request = (body: unknown = { reaction: "dislike" }) => new Request(url, { method: "PUT", headers: { authorization: "Bearer fixture", "content-type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); state.authorize.mockResolvedValue({ appUserId: owner }); });
it("routes PUT through bearer ownership and response validation", async () => {
  const value = { reaction: "dislike", likeCount: 2, dislikeCount: null };
  state.rpc.mockResolvedValue(value);
  const response = await PUT(request(), context);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(value);
  expect(state.rpc).toHaveBeenCalledWith("set_celebrity_notice_reaction", { p_slug: "elina", p_notice_slug: "artist-news", p_app_user_id: owner, p_locale: "ko", p_reaction: "dislike" });
});
it("reads guest reactions without authorizing a write", async () => {
  const value = { reaction: null, likeCount: 2, dislikeCount: null };
  state.rpc.mockResolvedValue(value);
  const response = await GET(new Request(url), context);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(value);
  expect(state.authorize).not.toHaveBeenCalled();
  expect(state.rpc).toHaveBeenCalledExactlyOnceWith("read_celebrity_notice_reaction", { p_slug: "elina", p_notice_slug: "artist-news", p_app_user_id: null, p_locale: "ko" });
});
it("keeps authentication failures before the write", async () => {
  state.authorize.mockRejectedValue(new AuthError("AUTHENTICATION_REQUIRED", 401, "expired"));
  expect((await PUT(request(), context)).status).toBe(401);
  expect(state.rpc).not.toHaveBeenCalled();
});
it("rejects caller supplied identity before the write", async () => {
  expect((await PUT(request({ reaction: "like", appUserId: owner }), context)).status).toBe(400);
  expect(state.rpc).not.toHaveBeenCalled();
});
it("rejects an invalid RPC response", async () => {
  state.rpc.mockResolvedValue({ reaction: "dislike", likeCount: -1, dislikeCount: null });
  expect((await PUT(request(), context)).status).toBe(503);
});
