import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { AuthError } from "@/features/auth/domain/auth-errors";
import { createMobileContentHandlers, type MobileContentDependencies } from "./routes";
import { fanClipSchema } from "./domain";

const owner = "71000000-0000-4000-8000-000000000001";
const id = "71000000-0000-4000-8000-000000000002";
const asset = "71000000-0000-4000-8000-000000000003";
const passport = "71000000-0000-4000-8000-000000000004";
const createdAt = "2026-10-12T00:00:00Z";
const clip = { id, celebritySlug: "artist", body: "clip", visibility: "public", revision: 1,
  author: { nickname: "Fan", avatarUrl: "/images/avatars/star-pink.webp" },
  assets: [{ id: asset, kind: "image", width: 390, height: 390, durationSeconds: null }],
  createdAt, updatedAt: createdAt, isOwner: false, likeCount: 0, liked: false, commentCount: 0 };

function dependencies() {
  return { authorize: vi.fn().mockResolvedValue({ appUserId: owner }), rpc: vi.fn() } satisfies MobileContentDependencies;
}
function request(method: string, body?: unknown, path = "/api") {
  return new Request(`https://byus.test${path}`, { method, headers: {
    authorization: "Bearer token", "content-type": "application/json",
  }, body: body === undefined ? undefined : JSON.stringify(body) });
}

describe("mobile content trust boundary", () => {
  it("returns only the owner's current official preview and marks the exact original read", async () => {
    const d = dependencies(), h = createMobileContentHandlers(d);
    const post = { id, slug: "original", title: "Official post", publishedAt: createdAt, readAt: null };
    d.rpc.mockResolvedValue(post);
    const response = await h.latestOfficialPost(request("GET", undefined, "/api?locale=en"), "artist");
    expect(await response.json()).toEqual({ post });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(d.rpc).toHaveBeenLastCalledWith("read_owned_mobile_latest_official_post", { p_app_user_id: owner, p_slug: "artist", p_locale: "en" });
    d.rpc.mockResolvedValue(createdAt);
    expect(await (await h.readOfficialPost(request("POST", {}, "/api?locale=ko"), "artist", "original")).json()).toEqual({ readAt: createdAt });
    expect(d.rpc).toHaveBeenLastCalledWith("mark_owned_mobile_official_post_read", {
      p_app_user_id: owner, p_slug: "artist", p_notice_slug: "original", p_locale: "ko",
    });
    d.rpc.mockResolvedValue(null);
    expect(await (await h.latestOfficialPost(request("GET"), "artist")).json()).toEqual({ post: null });
    d.rpc.mockResolvedValue({ ...post, privateAuthorId: owner });
    expect((await h.latestOfficialPost(request("GET"), "artist")).status).toBe(503);
    expect((await h.readOfficialPost(request("POST", { appUserId: id }), "artist", "original")).status).toBe(400);
    expect((await h.latestOfficialPost(request("GET", undefined, "/api?locale=ko&locale=en"), "artist")).status).toBe(400);
    d.authorize.mockRejectedValue(new AuthError("AUTHENTICATION_REQUIRED", 401, "invalid"));
    expect((await h.latestOfficialPost(request("GET"), "artist")).status).toBe(401);
  });

  it("preserves only validated optional clip author profile fields", () => {
    expect(fanClipSchema.parse(clip).author).toEqual(clip.author);
    const author = { ...clip.author, profileId: owner, fanTier: "Bronze" };
    expect(fanClipSchema.parse({ ...clip, author }).author).toEqual(author);
    expect(fanClipSchema.safeParse({ ...clip, author: { ...author, profileId: "private/path" } }).success).toBe(false);
    expect(fanClipSchema.safeParse({ ...clip, author: { ...author, privateEmail: "secret@example.test" } }).success).toBe(false);
  });
  it("looks up only the actor's clip request and recovers only its stamp", async () => {
    const d = dependencies(), h = createMobileContentHandlers(d);
    d.rpc.mockResolvedValue(null);
    const missing = await h.clipStatus(request("GET"), "artist", id);
    expect(await missing.json()).toEqual({ result: null });
    expect(d.rpc).toHaveBeenLastCalledWith("read_owned_mobile_clip_result", { p_app_user_id: owner, p_slug: "artist", p_idempotency_key: id });
    d.rpc.mockResolvedValue({ id, revision: 1, replayed: true, stamp: { status: "awarded", stampId: asset, issuedAt: createdAt }, reward: { status: "unconfigured" } });
    expect((await h.clipStatus(request("POST"), "artist", id)).status).toBe(200);
    expect(d.rpc).toHaveBeenLastCalledWith("recover_owned_mobile_clip_stamp", { p_app_user_id: owner, p_slug: "artist", p_idempotency_key: id });
    d.rpc.mockResolvedValue({ id, revision: 1, replayed: true, stamp: { status: "awarded" }, reward: { status: "unconfigured" } });
    expect((await h.clipStatus(request("GET"), "artist", id)).status).toBe(503);
  });

  it("binds a favorite album to the authenticated passport owner and strips storage paths", async () => {
    const d = dependencies();
    d.rpc.mockResolvedValue({
      favorite: { slug: "artist", name: "Artist", imageUrl: "/artist.webp" }, sourceAvailable: true,
      items: [{ id: asset, sourceType: "fan_clip", sourceId: id, kind: "video", body: "clip", createdAt,
        width: 390, height: 690, durationSeconds: 12, likeCount: 2 }], hasMore: false,
    });
    const response = await createMobileContentHandlers(d).favoriteAlbum(request("GET", undefined, "/api?locale=en&limit=12"), passport);
    expect(response.status).toBe(200);
    expect(d.rpc).toHaveBeenCalledWith("read_owned_mobile_favorite_album", expect.objectContaining({
      p_app_user_id: owner, p_passport_id: passport, p_locale: "en", p_limit: 12,
    }));
    expect(await response.json()).toEqual(expect.objectContaining({ sourceAvailable: true, nextCursor: null }));
  });

  it("allows an anonymous clip feed but validates a supplied credential", async () => {
    const d = dependencies(); d.rpc.mockResolvedValue({ items: [clip], hasMore: false });
    const anonymous = new Request("https://byus.test/api?locale=en");
    expect((await createMobileContentHandlers(d).clips(anonymous, "artist")).status).toBe(200);
    expect(d.authorize).not.toHaveBeenCalled();
    expect(d.rpc).toHaveBeenCalledWith("read_mobile_content_fan_clips", expect.objectContaining({ p_app_user_id: null, p_locale: "en" }));
    d.authorize.mockRejectedValueOnce(new AuthError("AUTHENTICATION_REQUIRED", 401, "invalid"));
    expect((await createMobileContentHandlers(d).clips(request("GET"), "artist")).status).toBe(401);
  });

  it("binds clip creation to the authenticated actor and forwards ordered assets", async () => {
    const d = dependencies(); d.rpc.mockResolvedValue({ id, revision: 1, replayed: false, stamp: { status: "preparing" }, reward: { status: "unconfigured" } });
    const response = await createMobileContentHandlers(d).clips(request("POST", {
      body: " clip ", visibility: "members", assetIds: [asset], idempotencyKey: id,
    }), "artist");
    expect(response.status).toBe(201);
    expect(d.rpc).toHaveBeenCalledWith("create_mobile_content_fan_clip", {
      p_app_user_id: owner, p_slug: "artist", p_body: "clip", p_visibility: "members", p_asset_ids: [asset], p_idempotency_key: id,
    });
  });

  it("rejects unknown detail queries and accidental private DTO fields", async () => {
    const d = dependencies(), h = createMobileContentHandlers(d);
    expect((await h.clip(request("GET", undefined, "/api?limit=1"), id)).status).toBe(400);
    d.rpc.mockResolvedValue({ ...clip, appUserId: owner });
    const response = await h.clip(request("GET", undefined, "/api?locale=ko"), id);
    expect(response.status).toBe(503); expect(await response.text()).not.toContain(owner);
  });

  it("maps invalid media to a client error without leaking database text", async () => {
    const d = dependencies(); d.rpc.mockRejectedValue(new Error("MEDIA_INVALID_ASSET"));
    const response = await createMobileContentHandlers(d).clips(request("POST", {
      body: "clip", visibility: "public", assetIds: [asset], idempotencyKey: id,
    }), "artist");
    expect(response.status).toBe(400); expect(await response.json()).toEqual({ error: { code: "MEDIA_INVALID_ASSET" } });
  });

  it("supports replacing and clearing a comment reaction", async () => {
    const d = dependencies(); d.rpc.mockResolvedValue({ commentId: id, reactions: [
      { emoji: "❤", count: 0, selected: false }, { emoji: "👏", count: 0, selected: false }, { emoji: "✨", count: 0, selected: false },
    ] });
    const response = await createMobileContentHandlers(d).commentReaction(request("PUT", { emoji: null }), "fan_clip_comment", id);
    expect(response.status).toBe(200);
    expect(d.rpc).toHaveBeenCalledWith("set_mobile_content_comment_reaction", { p_app_user_id: owner, p_target_type: "fan_clip_comment", p_target_id: id, p_emoji: null });
  });

  it("encodes a stable keyset cursor from the final item", async () => {
    const d = dependencies(); d.rpc.mockResolvedValue({ items: [clip], hasMore: true });
    const data = await (await createMobileContentHandlers(d).clips(request("GET"), "artist")).json();
    expect(JSON.parse(Buffer.from(data.nextCursor, "base64url").toString())).toEqual({ at: createdAt, id });
  });
});
