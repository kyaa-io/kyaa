import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { AuthError } from "@/features/auth/domain/auth-errors";
import { createFanpageHandlers } from "./routes";
const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const commentId = "33333333-3333-4333-8333-333333333333";
const row = { profileId: other, rank: 1, nickname: "별빛팬", avatarUrl: "/images/avatars/star-pink.webp", points: 12 };
const now = "2026-09-08T00:00:00.000Z";
const rpc = vi.fn();
const authorize = vi.fn(async (header: string | null) => { if (header !== "Bearer valid") throw new AuthError("AUTHENTICATION_REQUIRED", 401, "Sign in"); return { appUserId: owner }; });
const authorizeAdmin = vi.fn(async () => ({ appUserId: owner, allowlistId: other, email: "test@example.test", role: "admin" as const }));
const api = createFanpageHandlers({ rpc, authorize, authorizeAdmin });
function request(path = "/api", body?: unknown, authenticated = true, method = "POST") {
  return new Request(`https://byus.kr${path}`, { method, headers: { ...(authenticated ? { authorization: "Bearer valid" } : {}), "content-type": "application/json" }, body: method === "GET" ? undefined : JSON.stringify(body) });
}
describe("fanpage server authority", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it("reads guest notice reactions and writes only the authenticated choice", async () => {
    const state = { reaction: "dislike", likeCount: 3, dislikeCount: null };
    rpc.mockResolvedValue(state);
    expect((await api.noticeReaction(request("/api?locale=ko", undefined, false, "GET"), "elina", "walk")).status).toBe(200);
    expect(rpc).toHaveBeenLastCalledWith("read_celebrity_notice_reaction", { p_app_user_id: null, p_slug: "elina", p_notice_slug: "walk", p_locale: "ko" });
    expect(await (await api.noticeReaction(request("/api", { reaction: "dislike" }, true, "PUT"), "elina", "walk")).json()).toEqual(state);
    expect(rpc).toHaveBeenCalledWith("set_celebrity_notice_reaction", { p_app_user_id: owner, p_slug: "elina", p_notice_slug: "walk", p_locale: "ko", p_reaction: "dislike" });
    expect((await api.noticeReaction(request("/api", { reaction: "like", appUserId: other }, true, "PUT"), "elina", "walk")).status).toBe(400);
    expect((await api.noticeReaction(request("/api", { reaction: "like" }, false, "PUT"), "elina", "walk")).status).toBe(401);
    // read, write, and the notice read for the reward key (it answered without an id here, so nothing was paid).
    expect(rpc.mock.calls.map(call => call[0])).toEqual(["read_celebrity_notice_reaction", "set_celebrity_notice_reaction", "read_fan_notice"]);
  });
  describe("notice rewards follow the fan board rules", () => {
    const noticeId = "44444444-4444-4444-8444-444444444444", creatorId = "55555555-5555-4555-8555-555555555555";
    const paying = createFanpageHandlers({ rpc, authorize, authorizeAdmin, resolveCreatorId: async () => creatorId });
    const answers = (record: (args: Record<string, unknown>) => unknown, write: unknown) => rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
      if (name === "read_fan_notice") return { id: noticeId.toUpperCase() };
      if (name === "record_dukjil_action") return record(args);
      if (name === "record_dukjil_award_failure") return null;
      return write;
    });
    const awards = () => rpc.mock.calls.filter(call => call[0] === "record_dukjil_action").map(call => call[1] as Record<string, unknown>);
    it.each(["like", "dislike"] as const)("pays a first %s once per notice through record_dukjil_action", async (reaction) => {
      answers(() => ({ points: 1, stampId: null, capped: false, reason: null, replayed: false }), { reaction, likeCount: 1, dislikeCount: null });
      const body = await (await paying.noticeReaction(request("/api", { reaction }, true, "PUT"), "elina", "walk")).json();
      expect(body).toEqual({ reaction, likeCount: 1, dislikeCount: null, reward: { points: 1, stamps: 0 } });
      expect(awards()).toEqual([expect.objectContaining({ p_user: owner, p_celebrity: creatorId, p_action_key: "reaction", p_source_key: `notice-reaction:${noticeId}`, p_params: {} })]);
    });
    it("pays nothing for a cancel, a replay, or a read", async () => {
      answers(() => ({ points: 1, stampId: null, capped: false, reason: null, replayed: true }), { reaction: null, likeCount: 0, dislikeCount: null });
      expect(await (await paying.noticeReaction(request("/api", { reaction: "none" }, true, "PUT"), "elina", "walk")).json()).toEqual({ reaction: null, likeCount: 0, dislikeCount: null });
      expect(awards()).toHaveLength(0);
      answers(() => ({ points: 1, stampId: null, capped: false, reason: null, replayed: true }), { reaction: "like", likeCount: 1, dislikeCount: null });
      expect(await (await paying.noticeReaction(request("/api", { reaction: "like" }, true, "PUT"), "elina", "walk")).json()).toEqual({ reaction: "like", likeCount: 1, dislikeCount: null });
      expect((await paying.noticeReaction(request("/api?locale=ko", undefined, true, "GET"), "elina", "walk")).status).toBe(200);
      expect(awards()).toHaveLength(1);
    });
    it("a fan without this page's passport, or past the daily cap, keeps the reaction and gets no points", async () => {
      for (const [code, skippedReason] of [["PASSPORT_REQUIRED", "passport_required"], ["DUKJIL_DAILY_LIMIT", "daily_limit"]] as const) {
        answers(() => { throw new Error(code); }, { reaction: "like", likeCount: 1, dislikeCount: null });
        const response = await paying.noticeReaction(request("/api", { reaction: "like" }, true, "PUT"), "elina", "walk");
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ reaction: "like", likeCount: 1, dislikeCount: null, reward: { points: 0, stamps: 0, skippedReason } });
      }
      expect(rpc.mock.calls.some(call => call[0] === "record_dukjil_award_failure")).toBe(false);
    });
    it("pays a comment with the comment rule: its id as the source, the notice as the once-per-target key", async () => {
      answers(() => ({ points: 3, stampId: commentId, capped: false, reason: null, replayed: false }), { id: commentId, replayed: false });
      const body = await (await paying.postComment(request("/api", { body: "  오늘 소식 고마워요  ", idempotencyKey: other }), "elina", "walk")).json();
      expect(body).toEqual({ id: commentId, replayed: false, reward: { points: 3, stamps: 1 } });
      expect(awards()).toEqual([expect.objectContaining({ p_user: owner, p_celebrity: creatorId, p_action_key: "comment", p_source_key: commentId,
        p_params: { chars: 10, bodyHash: expect.stringMatching(/^[0-9a-f]{64}$/), isReply: false, targetKey: `notice:${noticeId}` } })]);
    });
    it("says why a comment paid nothing, and never pays a replayed request", async () => {
      answers(() => { throw new Error("DUKJIL_CONTENT_TOO_SHORT"); }, { id: commentId, replayed: false });
      expect(await (await paying.postComment(request("/api", { body: "hi", idempotencyKey: other }), "elina", "walk")).json()).toEqual({ id: commentId, replayed: false, reward: { points: 0, stamps: 0, skippedReason: "too_short" } });
      rpc.mockClear();
      answers(() => ({ points: 3, stampId: null, capped: false, reason: null, replayed: false }), { id: commentId, replayed: true });
      expect(await (await paying.postComment(request("/api", { body: "hi", idempotencyKey: other }), "elina", "walk")).json()).toEqual({ id: commentId, replayed: true });
      expect(awards()).toHaveLength(0);
    });
    it("a failed reward call never fails the reaction or the comment", async () => {
      rpc.mockImplementation(async (name: string) => { if (name === "set_celebrity_notice_reaction") return { reaction: "like", likeCount: 1, dislikeCount: null }; if (name === "post_celebrity_notice_comment") return { id: commentId, replayed: false }; throw new Error("database down"); });
      expect(await (await paying.noticeReaction(request("/api", { reaction: "like" }, true, "PUT"), "elina", "walk")).json()).toEqual({ reaction: "like", likeCount: 1, dislikeCount: null });
      expect(await (await paying.postComment(request("/api", { body: "응원해요", idempotencyKey: other }), "elina", "walk")).json()).toEqual({ id: commentId, replayed: false });
    });
  });
  it("sets official notice likes for the authenticated owner and rejects extra caller identity", async () => {
    rpc.mockResolvedValueOnce({ liked: true, likeCount: 3 });
    const response = await api.likeNotice(request("/api", { liked: true }, true, "PUT"), "elina", "walk");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ liked: true, likeCount: 3 });
    expect(rpc).toHaveBeenCalledWith("set_celebrity_notice_liked", { p_app_user_id: owner, p_slug: "elina", p_notice_slug: "walk", p_liked: true });
    expect((await api.likeNotice(request("/api", { liked: true, appUserId: other }, true, "PUT"), "elina", "walk")).status).toBe(400);
    expect((await api.likeNotice(request("/api", { liked: false }, false, "PUT"), "elina", "walk")).status).toBe(401);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("rejects invalid credentials on an otherwise public summary", async () => {
    const response = await api.summary(new Request("https://byus.kr/api", { headers: { authorization: "Bearer wrong" } }), "elina");
    expect(response.status).toBe(401); expect(rpc).not.toHaveBeenCalled();
  });
  it("returns no ranks or own projection below the 100-member boundary", async () => {
    rpc.mockResolvedValueOnce({ membershipCount: 99, fanCount: 99, available: false, asOf: now, rows: [], me: null });
    const response = await api.leaderboard(request("/api", undefined, true, "GET"), "elina");
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: { code: "LEADERBOARD_NOT_AVAILABLE" }, membershipCount: 99, fanCount: 99 });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(rpc).toHaveBeenCalledWith("read_celebrity_fan_leaderboard", { p_slug: "elina", p_app_user_id: owner, p_locale: "ko" });
  });
  it.each([100, 101])("returns Top100 at %i but never trusts a caller's requested owner", async (membershipCount) => {
    rpc.mockResolvedValueOnce({ membershipCount: 99, fanCount: membershipCount, available: true, asOf: now, rows: [row], me: row });
    const response = await api.leaderboard(request(`/api?appUserId=${other}`, undefined, false, "GET"), "elina");
    expect(response.status).toBe(200); expect((await response.json()).me).toBeNull();
    expect(rpc).toHaveBeenCalledWith("read_celebrity_fan_leaderboard", { p_slug: "elina", p_app_user_id: null, p_locale: "ko" });
  });
  it("validates leaderboard categories and keeps all on the rolling-compatible overload", async () => {
    rpc.mockResolvedValue({ membershipCount: 100, fanCount: 100, available: true, asOf: now, rows: [row], me: null });
    expect((await api.leaderboard(request("/api?category=all", undefined, false, "GET"), "elina")).status).toBe(200);
    expect(rpc).toHaveBeenLastCalledWith("read_celebrity_fan_leaderboard", { p_slug: "elina", p_app_user_id: null, p_locale: "ko" });
    expect((await api.leaderboard(request("/api?category=mission", undefined, false, "GET"), "elina")).status).toBe(200);
    expect(rpc).toHaveBeenLastCalledWith("read_celebrity_fan_leaderboard", { p_slug: "elina", p_app_user_id: null, p_locale: "ko", p_category: "mission" });
    for (const query of ["category=", "category=other", "category=live&category=mission"]) {
      expect((await api.leaderboard(request(`/api?${query}`, undefined, false, "GET"), "elina")).status).toBe(400);
    }
    expect(rpc).toHaveBeenCalledTimes(2);
  });
  it("accepts the legacy pre-migration boundary while fanCount is absent", async () => {
    rpc.mockResolvedValueOnce({ membershipCount: 100, available: false, asOf: now, rows: [], me: null });
    const response = await api.leaderboard(request("/api", undefined, false, "GET"), "elina");
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: { code: "LEADERBOARD_NOT_AVAILABLE" }, membershipCount: 100 });
  });
  it("passes a validated locale to public read RPCs", async () => {
    rpc.mockResolvedValueOnce({ membershipCount: 0, leaderboardAvailable: false, activity: [] });
    expect((await api.summary(request("/api?locale=en", undefined, false, "GET"), "elina")).status).toBe(200);
    expect(rpc).toHaveBeenLastCalledWith("read_celebrity_fanpage_for_viewer", { p_slug: "elina", p_app_user_id: null, p_locale: "en" });
    expect((await api.summary(request("/api?locale=fr", undefined, false, "GET"), "elina")).status).toBe(400);
    expect((await api.summary(request("/api?locale=ko&locale=en", undefined, false, "GET"), "elina")).status).toBe(400);
  });
  it("treats a broken server boundary or private field as unavailable rather than exposing it", async () => {
    rpc.mockResolvedValueOnce({ membershipCount: 99, fanCount: 99, available: true, asOf: now, rows: [row], me: row });
    expect((await api.leaderboard(request("/api", undefined, false, "GET"), "elina")).status).toBe(503);
    rpc.mockResolvedValueOnce({ membershipCount: 99, fanCount: 100, available: true, asOf: now, rows: [{ ...row, email: "secret" }], me: null });
    expect((await api.leaderboard(request("/api", undefined, false, "GET"), "elina")).status).toBe(503);
  });
  it("rejects caller-supplied author and trims the permitted comment", async () => {
    expect((await api.postComment(request("/api", { body: "hi", idempotencyKey: other, appUserId: other }), "elina", "notice")).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValueOnce({ id: commentId, replayed: false });
    expect((await api.postComment(request("/api", { body: "  응원해요  ", idempotencyKey: other }), "elina", "notice")).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("post_celebrity_notice_comment", { p_app_user_id: owner, p_slug: "elina", p_notice_slug: "notice", p_body: "응원해요", p_idempotency_key: other });
  });
  it("posts a reply only through the parent-scoped RPC", async () => {
    rpc.mockResolvedValueOnce({ id: commentId, replayed: false });
    const response = await api.postComment(request("/api", {
      body: "답글이에요", idempotencyKey: other, parentId: commentId,
    }), "elina", "notice");
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("post_celebrity_notice_reply", {
      p_app_user_id: owner, p_slug: "elina", p_notice_slug: "notice", p_body: "답글이에요",
      p_idempotency_key: other, p_parent_id: commentId,
    });
  });
  it("validates and returns a bounded comment reaction", async () => {
    rpc.mockResolvedValueOnce({ emoji: "heart", count: 3, selected: true });
    const response = await api.reactToComment(request("/api", { emoji: "heart", selected: true }), commentId);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ emoji: "heart", count: 3, selected: true });
    expect(rpc).toHaveBeenCalledWith("set_notice_comment_reaction", {
      p_app_user_id: owner, p_comment_id: commentId, p_emoji: "heart", p_selected: true,
    });
    expect((await api.reactToComment(request("/api", { emoji: "fire", selected: true }), commentId)).status).toBe(400);
  });
  it("rejects oversized chunks before reading the rest of the body", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(8193)); }, cancel });
    const req = new Request("https://byus.kr/api", { method: "POST", headers: { authorization: "Bearer valid" }, body: stream, duplex: "half" } as RequestInit);
    expect((await api.postComment(req, "elina", "notice")).status).toBe(413);
    expect(cancel).toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
  });
  it.each([["FAN_WEB_FORBIDDEN", 403], ["FANPAGE_RATE_LIMITED", 429], ["FANPAGE_IDEMPOTENCY_CONFLICT", 409], ["FANPAGE_NOT_FOUND", 404]])("preserves %s", async (code, status) => {
    rpc.mockRejectedValueOnce(new Error(code));
    expect((await api.postComment(request("/api", { body: "hi", idempotencyKey: other }), "elina", "notice")).status).toBe(status);
  });
  it("never leaks database error text", async () => {
    rpc.mockRejectedValueOnce(new Error("secret database internals"));
    const response = await api.removeComment(request(), commentId);
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("secret");
  });
  it("sends only the authenticated owner to comment removal", async () => {
    rpc.mockResolvedValueOnce(null);
    expect((await api.removeComment(request(`/api?appUserId=${other}`), commentId)).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("remove_owned_notice_comment", { p_app_user_id: owner, p_comment_id: commentId });
  });
  it("preserves keyset cursors and owner-scoped comment projection", async () => {
    const comment = { id: commentId, body: "hello", nickname: "fan", avatarUrl: row.avatarUrl, createdAt: now, isOwner: true };
    rpc.mockResolvedValueOnce({ total: 2, comments: [comment] });
    const response = await api.comments(request("/api?limit=1", undefined, true, "GET"), "elina", "notice");
    const result = await response.json(); expect(result.comments).toEqual([comment]);
    expect(JSON.parse(Buffer.from(result.nextCursor, "base64url").toString())).toEqual({ at: now, id: commentId });
    expect(rpc).toHaveBeenLastCalledWith("read_celebrity_notice_comments", expect.objectContaining({ p_locale: "ko" }));
  });
  it("requires admin authorization and bounded nonempty reasons", async () => {
    rpc.mockResolvedValueOnce(null);
    expect((await api.hideComment(request("/api", { reason: "운영 기준 위반" }), commentId)).status).toBe(200);
    expect(authorizeAdmin).toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("hide_admin_notice_comment", expect.objectContaining({ p_actor_app_user_id: owner, p_actor_admin_allowlist_id: other, p_comment_id: commentId, p_reason: "운영 기준 위반" }));
    expect((await api.hideComment(request("/api", { reason: " " }), commentId)).status).toBe(400);
  });
  it("uses a stable tuple cursor and an explicit lookahead for admin comments", async () => {
    const comments = Array.from({ length: 51 }, (_, index) => ({
      id: `33333333-3333-4333-8333-${String(index + 1).padStart(12, "0")}`,
      body: `comment ${index + 1}`,
      nickname: "fan",
      celebritySlug: "elina",
      noticeSlug: "notice",
      createdAt: now,
    }));
    rpc.mockResolvedValueOnce({ comments });
    const first = await api.adminComments(request("/api", undefined, true, "GET"));
    const body = await first.json();
    expect(body.comments).toHaveLength(50);
    expect(JSON.parse(Buffer.from(body.nextCursor, "base64url").toString())).toEqual({
      at: now,
      id: comments[49].id,
    });
    expect(rpc).toHaveBeenLastCalledWith("read_admin_notice_comments", expect.objectContaining({
      p_before: null,
      p_before_id: null,
      p_limit: 51,
    }));

    rpc.mockResolvedValueOnce({ comments: [] });
    const second = await api.adminComments(request(`/api?cursor=${encodeURIComponent(body.nextCursor)}`, undefined, true, "GET"));
    expect(second.status).toBe(200);
    expect(rpc).toHaveBeenLastCalledWith("read_admin_notice_comments", expect.objectContaining({
      p_before: now,
      p_before_id: comments[49].id,
    }));

    rpc.mockResolvedValueOnce({ comments: comments.slice(0, 50) });
    const exactPage = await api.adminComments(request("/api", undefined, true, "GET"));
    expect((await exactPage.json()).nextCursor).toBeNull();
  });
  it("rejects malformed admin comment cursors before calling the RPC", async () => {
    expect((await api.adminComments(request("/api?cursor=broken", undefined, true, "GET"))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("forwards the legacy timestamp cursor to the compatible four-argument RPC", async () => {
    rpc.mockResolvedValueOnce({ comments: [] });
    expect((await api.adminComments(request(`/api?before=${encodeURIComponent(now)}`, undefined, true, "GET"))).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("read_admin_notice_comments", {
      p_actor_app_user_id: owner,
      p_actor_admin_allowlist_id: other,
      p_slug: null,
      p_before: now,
    });

    expect((await api.adminComments(request(`/api?before=${encodeURIComponent(now)}&cursor=broken`, undefined, true, "GET"))).status).toBe(400);
  });
  it("requires an explicit boolean to change activity visibility", async () => {
    rpc.mockResolvedValueOnce({ enabled: false });
    expect((await api.visibility(request("/api", undefined, true, "GET"))).status).toBe(200);
    expect((await api.visibility(request("/api", { enabled: "true" }, true, "PATCH"))).status).toBe(400);
    rpc.mockResolvedValueOnce({ enabled: true });
    expect((await api.visibility(request("/api", { enabled: true }, true, "PATCH"))).status).toBe(200);
    expect(rpc).toHaveBeenLastCalledWith("set_owned_fan_activity_visibility", { p_app_user_id: owner, p_enabled: true });
  });
});
