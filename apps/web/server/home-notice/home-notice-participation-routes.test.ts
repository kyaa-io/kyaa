import { describe, expect, it, vi } from "vitest";
import { AuthError } from "@/features/auth/domain/auth-errors";
import { createHomeNoticeParticipationHandlers } from "./home-notice-participation-routes";
vi.mock("server-only", () => ({}));
const owner = "a0000000-0000-4000-8000-000000000001", id = "b0000000-0000-4000-8000-000000000001";
const state = { reaction: null, likeCount: 3, dislikeCount: null, commentCount: 1 };
const comment = { id, body: "감사합니다.", revision: 1, createdAt: "2026-11-10T00:00:00Z", isOwner: true, author: { nickname: "팬", avatarUrl: "/images/avatars/star-pink.webp" } };
function setup(value: unknown = state) {
  const rpc = vi.fn().mockResolvedValue(value);
  const authorize = vi.fn(async (header: string | null) => { if (header !== "Bearer fixture") throw new AuthError("AUTHENTICATION_REQUIRED", 401, "missing"); return { appUserId: owner }; });
  return { rpc, authorize, h: createHomeNoticeParticipationHandlers({ rpc, authorize }) };
}
const request = (method = "GET", body?: unknown, authenticated = true, query = "") => new Request(`https://kyaa.test/api/notices/service-guide${query}`, { method, headers: { ...(authenticated ? { authorization: "Bearer fixture" } : {}), "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
describe("home CMS notice participation", () => {
  it("permits guest reads without authentication and forbids caching personal state", async () => {
    const { h, rpc, authorize } = setup();
    const response = await h.participation(request("GET", undefined, false), "service-guide");
    expect(await response.json()).toEqual(state);
    expect(authorize).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("read_home_notice_participation", { p_slug: "service-guide", p_app_user_id: null });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("vary")).toBe("Authorization");
  });
  it("rejects invalid credentials on reads and all anonymous writes before an RPC", async () => {
    const { h, rpc } = setup();
    const invalid = new Request("https://kyaa.test", { headers: { authorization: "Bearer expired" } });
    expect((await h.participation(invalid, "service-guide")).status).toBe(401);
    expect((await h.comments(request("POST", { body: "a", idempotencyKey: id }, false), "service-guide")).status).toBe(401);
    expect((await h.reaction(request("PUT", { reaction: "like" }, false), "service-guide")).status).toBe(401);
    expect((await h.removeComment(request("DELETE", undefined, false), id)).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("uses the authenticated owner and preserves the retry key while trimming the body", async () => {
    const { h, rpc } = setup({ id, revision: 1, replayed: true });
    const response = await h.comments(request("POST", { body: " 감사합니다. ", idempotencyKey: id }), "service-guide");
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("post_home_notice_comment", { p_slug: "service-guide", p_app_user_id: owner, p_body: "감사합니다.", p_idempotency_key: id });
    expect(await response.json()).toMatchObject({ replayed: true });
  });
  it.each([{ body: " ", idempotencyKey: id }, { body: "a".repeat(1001), idempotencyKey: id }, { body: "a", idempotencyKey: id, appUserId: id }, { body: "a", idempotencyKey: id, parentId: id }])("rejects malformed comment input %#", async body => {
    const { h, rpc } = setup();
    expect((await h.comments(request("POST", body), "service-guide")).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects an oversized body before writing", async () => {
    const { h, rpc } = setup();
    expect((await h.comments(request("POST", { body: "a".repeat(9000), idempotencyKey: id }), "service-guide")).status).toBe(413);
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each(["like", "dislike", "none"])("passes the explicit %s choice, never a public dislike count", async reaction => {
    const { h, rpc } = setup();
    expect((await h.reaction(request("PUT", { reaction }), "service-guide")).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("set_home_notice_reaction", { p_slug: "service-guide", p_app_user_id: owner, p_reaction: reaction });
    const leaked = setup({ ...state, dislikeCount: 9 });
    const response = await leaked.h.participation(request(), "service-guide");
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("dislikeCount");
  });
  it("builds and checks the keyset cursor without exposing owner ids", async () => {
    const { h, rpc } = setup({ items: [comment], hasMore: true });
    const response = await h.comments(request(), "service-guide");
    const page = await response.json();
    expect(page.items).toEqual([comment]);
    expect(JSON.parse(Buffer.from(page.nextCursor, "base64url").toString())).toEqual({ at: comment.createdAt, id });
    await h.comments(request("GET", undefined, true, `?locale=en&cursor=${page.nextCursor}`), "service-guide");
    expect(rpc).toHaveBeenLastCalledWith("read_home_notice_comments", expect.objectContaining({ p_before: comment.createdAt, p_before_id: id, p_locale: "en" }));
    rpc.mockClear();
    expect((await h.comments(request("GET", undefined, true, "?cursor=bad"), "service-guide")).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([["FAN_WEB_NOT_FOUND",404],["FAN_WEB_FORBIDDEN",403],["FAN_WEB_CONFLICT",409],["FAN_WEB_RATE_LIMITED",429],["database private details",503]] as const)("maps %s without leaking implementation errors", async (code, status) => {
    const { h, rpc } = setup(); rpc.mockRejectedValue(new Error(code));
    const response = await h.removeComment(request("DELETE"), id);
    expect(response.status).toBe(status);
    expect(rpc).toHaveBeenCalledWith("remove_home_notice_comment", { p_comment_id: id, p_app_user_id: owner });
    if (status === 503) expect(JSON.stringify(await response.json())).not.toContain(code);
  });
});
