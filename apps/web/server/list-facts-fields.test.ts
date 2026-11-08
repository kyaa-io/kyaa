import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createGroupHandler } from "./groups/routes";
import { createSocialHandlers } from "./social/routes";
import { createContentHandlers, type ContentDependencies } from "./fan-posts/routes";
import { createFanpageHandlers } from "./fanpage/routes";
import { createGetNotificationsHandler } from "./notification/notification-route";
import { notificationRowFacts } from "./notification/notification-repository";
import { groupListSchema, groupCommentsSchema } from "@/features/groups/domain/contracts";
import { friendFactsSchema } from "@/features/fanpage/domain/wave-friends";
import { notificationItemSchema } from "@/features/notification/domain/notification-model";

// 6th-round list facts: every new key comes only when the web asks with ?fields=..., and a request without it calls the old reader.
const me = "10000000-0000-4000-8000-000000000001";
const page = "10000000-0000-4000-8000-000000000002";
const post = "10000000-0000-4000-8000-000000000003";
const req = (path: string) => new Request(`https://kyaa.test${path}`, { headers: { authorization: "Bearer valid" } });

describe("group directory and comment facts", () => {
  const setup = () => {
    const rpc = vi.fn().mockResolvedValue({ items: [], nextCursor: null });
    return { rpc, handler: createGroupHandler({ rpc, authorize: vi.fn(async () => ({ appUserId: me })), authorizeAdmin: vi.fn() }) };
  };
  it("sends fields only when asked, and only the known value", async () => {
    const s = setup();
    expect((await s.handler("directory", req("/api/groups?sort=today"))).status).toBe(200);
    expect(s.rpc.mock.lastCall?.[1].p_input).not.toHaveProperty("fields");
    expect((await s.handler("directory", req("/api/groups?sort=today&fields=facts"))).status).toBe(200);
    expect(s.rpc).toHaveBeenLastCalledWith("groups_dispatch", expect.objectContaining({ p_input: expect.objectContaining({ fields: "facts", sort: "today" }) }));
    expect((await s.handler("directory", req("/api/groups?fields=all"))).status).toBe(400);
    expect((await s.handler("directory", req("/api/groups?fields=facts&fields=facts"))).status).toBe(400);
  });
  it("asks for reply counts on comment pages only", async () => {
    const s = setup();
    expect((await s.handler("comments", req("/api?fields=replies"), { id: page, itemId: post })).status).toBe(200);
    expect(s.rpc).toHaveBeenLastCalledWith("groups_content_dispatch", expect.objectContaining({ p_operation: "comments", p_input: expect.objectContaining({ fields: "replies" }) }));
    expect((await s.handler("comments", req("/api"), { id: page, itemId: post })).status).toBe(200);
    expect(s.rpc.mock.lastCall?.[1].p_input).not.toHaveProperty("fields");
    expect((await s.handler("posts", req("/api?fields=replies"), { id: page })).status).toBe(200);
    expect(s.rpc.mock.lastCall?.[1].p_input).not.toHaveProperty("fields");
  });
  it("parses directory items with and without the facts", () => {
    const item = { id: page, kind: "fan", celebrityId: null, slug: null, name: "A", description: "B", imageUrl: null, question: null, memberCount: 3 };
    expect(groupListSchema.parse({ items: [item], nextCursor: null }).items[0]).toEqual(item);
    const facts = { weeklyJoined: 2, newPostCount: 0, liveNow: false, lastActiveAt: "2026-11-08T15:48:25.395776+09:00" };
    expect(groupListSchema.parse({ items: [{ ...item, ...facts }], nextCursor: null }).items[0]).toEqual({ ...item, ...facts });
    expect(groupListSchema.parse({ items: [{ ...item, weeklyJoined: 0, newPostCount: 0, liveNow: false, lastActiveAt: null }], nextCursor: null }).items[0].lastActiveAt).toBeNull();
    expect(groupCommentsSchema.parse({ items: [{ id: post, parentId: null, body: "b", profileId: null, nickname: "익명", avatarUrl: null, anonymous: true, createdAt: "2026-11-08T00:00:00Z", assets: [], replyCount: 0 }], nextCursor: null }).items[0].replyCount).toBe(0);
  });
});

describe("friend facts", () => {
  it("reads the facts reader only with fields=facts", async () => {
    const rpc = vi.fn().mockResolvedValue({ friendships: [], exchanges: [] });
    const api = createSocialHandlers({ rpc, authorize: vi.fn(async () => ({ appUserId: me })) });
    await api.listFriends(req("/api/me/social/friends?locale=ko"));
    expect(rpc).toHaveBeenLastCalledWith("read_owned_social_friends", { p_app_user_id: me, p_locale: "ko" });
    await api.listFriends(req("/api/me/social/friends?locale=en&fields=facts"));
    expect(rpc).toHaveBeenLastCalledWith("read_owned_social_friends_facts", { p_app_user_id: me, p_locale: "en" });
    expect((await api.listFriends(req("/api/me/social/friends?fields=tier"))).status).toBe(400);
  });
  it("accepts open, empty and restricted friends", () => {
    expect(friendFactsSchema.parse({ tier: "Gold", hearts: 3, favorite: { slug: "elina", name: "엘리나" } }).hearts).toBe(3);
    expect(friendFactsSchema.parse({ tier: null, hearts: null, favorite: null })).toEqual({ tier: null, hearts: null, favorite: null });
    expect(friendFactsSchema.parse({})).toEqual({});
  });
});

describe("comment reply counts", () => {
  it("fan post comments call the replies reader only when asked", async () => {
    const rpc = vi.fn().mockResolvedValue({ items: [{ id: post, postId: page, parentId: null, body: "b", revision: 1, author: { nickname: "팬", avatarUrl: "/images/avatars/star-pink.webp" }, createdAt: "2026-11-08T00:00:00Z", isOwner: false, reactions: [], replyCount: 2 }], hasMore: false });
    const deps = { rpc, authorize: vi.fn().mockResolvedValue({ appUserId: me }), authorizeAdmin: vi.fn(), upload: vi.fn(), download: vi.fn(), translate: vi.fn() } satisfies ContentDependencies;
    const api = createContentHandlers(deps);
    const response = await api.comments(req(`/api/posts/${post}/comments?fields=replies`), post);
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenLastCalledWith("read_fan_post_comments_replies", expect.objectContaining({ p_app_user_id: me, p_post_id: post }));
    expect((await response.json()).items[0].replyCount).toBe(2);
    rpc.mockResolvedValue({ items: [], hasMore: false });
    await api.comments(req(`/api/posts/${post}/comments`), post);
    expect(rpc).toHaveBeenLastCalledWith("read_fan_post_comments", expect.objectContaining({ p_post_id: post }));
    expect((await api.comments(req(`/api/posts/${post}/comments?fields=all`), post)).status).toBe(400);
  });
  it("notice comments call the replies reader only when asked", async () => {
    const rpc = vi.fn().mockResolvedValue({ total: 0, comments: [] });
    const api = createFanpageHandlers({ rpc, authorize: vi.fn(async () => ({ appUserId: me })), authorizeAdmin: vi.fn() } as never);
    expect((await api.comments(req("/api?fields=replies"), "elina", "notice-one")).status).toBe(200);
    expect(rpc).toHaveBeenLastCalledWith("read_celebrity_notice_comments_replies", expect.objectContaining({ p_slug: "elina", p_notice_slug: "notice-one" }));
    expect((await api.comments(req("/api"), "elina", "notice-one")).status).toBe(200);
    expect(rpc).toHaveBeenLastCalledWith("read_celebrity_notice_comments", expect.anything());
  });
});

describe("notification actors", () => {
  const item = { id: post, kind: "content_reply" as const, title: "새 댓글이 도착했어요", detail: "확인해 주세요.", createdAt: "2026-11-08T00:00:00.000Z", readAt: null, deepLink: "/my" as const };
  const deps = () => ({ authorize: vi.fn(async () => ({ appUserId: me })), repository: { list: vi.fn(async () => [item]) } });
  it("passes facts to the repository only with fields=actor", async () => {
    const d = deps();
    const handler = createGetNotificationsHandler(d as never);
    await handler(req("/api/notifications"));
    expect(d.repository.list).toHaveBeenLastCalledWith({ appUserId: me, locale: "ko", recipientLinks: false });
    await handler(req("/api/notifications?fields=actor"));
    expect(d.repository.list).toHaveBeenLastCalledWith({ appUserId: me, locale: "ko", recipientLinks: false, facts: true });
    expect((await handler(req("/api/notifications?fields=target"))).status).toBe(400);
  });
  it("keeps good facts and drops malformed ones without dropping the row", () => {
    const actor = { profileId: me, nickname: "이퓨", avatarUrl: "/images/avatars/star-pink.webp" };
    const target = { type: "fan_post", id: post, label: "내 글" };
    expect(notificationRowFacts({ actor, target, thumbnail_url: `/api/content-assets/${post}?size=thumbnail` })).toEqual({ actor, target, thumbnailUrl: `/api/content-assets/${post}?size=thumbnail` });
    expect(notificationRowFacts({ actor: null, target: null, thumbnail_url: null })).toEqual({ actor: null, target: null, thumbnailUrl: null });
    expect(notificationRowFacts({ actor: { profileId: "x" }, target: { type: "secret", id: post, label: null } })).toEqual({ actor: null, target: null, thumbnailUrl: null });
    // An official post names the creator, not a member.
    expect(notificationRowFacts({ actor: { profileId: null, nickname: "엘리나", avatarUrl: null } }).actor?.profileId).toBeNull();
    expect(notificationItemSchema.parse({ ...item, ...notificationRowFacts({ actor, target }) }).actor).toEqual(actor);
    expect(Object.keys(notificationItemSchema.parse(item))).not.toContain("actor");
  });
});
