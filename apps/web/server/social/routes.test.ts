import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { AuthError } from "@/features/auth/domain/auth-errors";
import { createSocialHandlers } from "./routes";

const me = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const rpc = vi.fn();
const authorize = vi.fn(async (value: string | null) => { if (value !== "Bearer valid") throw new AuthError("AUTHENTICATION_REQUIRED", 401, "Sign in"); return { appUserId: me }; });
const api = createSocialHandlers({ rpc, authorize });
const request = (path: string, value?: unknown, method = "GET") => new Request(`https://byus.test${path}`, { method, headers: { authorization: "Bearer valid", "content-type": "application/json" }, body: value === undefined ? undefined : JSON.stringify(value) });

describe("mobile social routes", () => {
  beforeEach(() => vi.clearAllMocks());
  it("reads the strict profile DTO for the authenticated viewer", async () => {
    const profile = { profile: { id: other, nickname: "팬친구", avatarUrl: "/images/avatars/star-pink.webp", accountLevel: { ruleVersion: "favorite-xp-sum-v1", status: "configured", tier: "Gold", xp: 72, progress: { policyVersion: 2 } } }, favorite: { slug: "elina", name: "엘리나", imageUrl: "/creator.webp", fanXp: 12, fanTier: "Bronze", verified: true }, publicActivityCount: 0, activities: [], activityNextCursor: null, commonFavorites: [], relationship: { friendshipId: null, status: "none", celebritySlug: null }, dm: { conversationId: null, status: "none", canSend: false }, capabilities: { canRequestFriend: true, canRequestDm: true, canBlock: true }, isSelf: false };
    rpc.mockResolvedValue(profile);
    const response = await api.profile(request(`/api?celebritySlug=elina&locale=ko`), other);
    expect(response.status).toBe(200); expect(await response.json()).toEqual(profile);
    expect(rpc).toHaveBeenCalledWith("read_social_fan_profile", { p_app_user_id: me, p_profile_id: other, p_celebrity_slug: "elina", p_locale: "ko", p_before: null, p_before_id: null, p_before_kind: null, p_limit: 12 });
  });
  it("lets the RPC choose the stable default visible favorite when profile navigation has no slug", async () => {
    const profile = { profile: { id: other, nickname: "팬친구", avatarUrl: "/images/avatars/star-pink.webp", accountLevel: { ruleVersion: "favorite-xp-sum-v1", status: "configured", tier: "Gold", xp: 72, progress: { policyVersion: 2 } } }, favorite: { slug: "elina", name: "엘리나", imageUrl: "/creator.webp", fanXp: 12, fanTier: "Bronze", verified: true }, publicActivityCount: 0, activities: [], activityNextCursor: null, commonFavorites: [], relationship: { friendshipId: null, status: "none", celebritySlug: null }, dm: { conversationId: null, status: "none", canSend: false }, capabilities: { canRequestFriend: true, canRequestDm: true, canBlock: true }, isSelf: false };
    rpc.mockResolvedValue(profile); const response = await api.profile(request("/api"), other);
    expect(response.status).toBe(200); expect(rpc).toHaveBeenCalledWith("read_social_fan_profile", expect.objectContaining({ p_celebrity_slug: null }));
  });
  it("resolves a linked profile through the eight-argument exchange RPC", async () => {
    const profile = { profile: { id: other, nickname: "팬친구", avatarUrl: "/images/avatars/star-pink.webp", accountLevel: { ruleVersion: "favorite-xp-sum-v1", status: "configured", tier: "Gold", xp: 72, progress: { policyVersion: 2 } } }, favorite: { slug: "elina", name: "엘리나", imageUrl: "/creator.webp", fanXp: 12, fanTier: "Bronze", verified: true }, publicActivityCount: 0, activities: [], activityNextCursor: null, commonFavorites: [], relationship: { friendshipId: null, status: "none", celebritySlug: null }, dm: { conversationId: null, status: "none", canSend: false }, capabilities: { canRequestFriend: true, canRequestDm: true, canBlock: true }, isSelf: false };
    rpc.mockResolvedValue(profile);
    const response = await api.linkedProfile(request(`/api?celebritySlug=elina&locale=ko`), other);
    expect(response.status).toBe(200); expect(await response.json()).toEqual(profile);
    expect(rpc).toHaveBeenCalledWith("resolve_social_profile_link", { p_app_user_id: me, p_token: other, p_celebrity_slug: "elina", p_locale: "ko", p_before: null, p_before_id: null, p_before_kind: null, p_limit: 12 });
  });
  it("passes only a protected ready-media identifier to DM persistence", async () => {
    rpc.mockResolvedValue({ id: me, createdAt: "2026-10-11T00:00:00Z", assetId: other, replayed: false });
    const response = await api.sendMessage(request("/api", { text: "", assetId: other, requestId: me }, "POST"), other);
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("send_social_dm_message", { p_app_user_id: me, p_conversation_id: other, p_body: "", p_asset_id: other, p_request_id: me });
  });
  it("stops reading an oversized streamed body", async () => {
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(`{"text":"${"x".repeat(9000)}"}`)); controller.close(); } });
    const oversized = new Request("https://byus.test/api", { method: "POST", headers: { authorization: "Bearer valid", "content-type": "application/json" }, body: stream, duplex: "half" } as RequestInit & { duplex: "half" });
    expect((await api.sendMessage(oversized, other)).status).toBe(413); expect(rpc).not.toHaveBeenCalled();
  });
  it("passes the stable incremental cursor tuple", async () => {
    rpc.mockResolvedValue({ messages: [] });
    const cursor = Buffer.from(JSON.stringify({ at: "2026-10-11T00:00:00Z", id: other })).toString("base64url");
    expect((await api.messages(request(`/api?cursor=${cursor}&limit=25`), other)).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("read_social_dm_messages", { p_app_user_id: me, p_conversation_id: other, p_after: "2026-10-11T00:00:00Z", p_after_id: other, p_limit: 25 });
  });
  it("creates a first DM with one bounded text and can recheck an uncertain outcome", async () => {
    rpc.mockResolvedValueOnce({ id: other, status: "pending", firstMessageId: me, retryAt: null, replayed: false });
    expect((await api.requestDm(request("/api", { profileId: other, text: "  hello  ", requestId: me }, "POST"))).status).toBe(200);
    expect(rpc).toHaveBeenLastCalledWith("request_social_dm", { p_app_user_id: me, p_profile_id: other, p_body: "hello", p_request_id: me });
    rpc.mockResolvedValueOnce({ found: true, state: "completed", operation: "request_dm", response: { id: other } });
    expect((await api.requestStatus(request("/api"), me)).status).toBe(200);
    expect(rpc).toHaveBeenLastCalledWith("read_owned_social_request_status", { p_app_user_id: me, p_request_id: me });
  });
  it("fails closed before RPC on invalid auth and duplicate profile query", async () => {
    const bad = new Request(`https://byus.test/api?celebritySlug=elina`, { headers: { authorization: "bad" } });
    expect((await api.profile(bad, other)).status).toBe(401);
    expect((await api.profile(request(`/api?celebritySlug=elina&celebritySlug=other`), other)).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});
