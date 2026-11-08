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

const minimalProfile = async () => ({ profile: { id: other, nickname: "팬친구", avatarUrl: "/images/avatars/star-pink.webp", accountLevel: { ruleVersion: "favorite-xp-sum-v1", status: "configured", tier: "Gold", xp: 72, progress: { policyVersion: 2 } } }, favorite: { slug: "elina", name: "엘리나", imageUrl: "/creator.webp", fanXp: 12, fanTier: "Bronze", verified: true }, publicActivityCount: 0, activities: [], activityNextCursor: null, commonFavorites: [], relationship: { friendshipId: null, status: "none", celebritySlug: null }, dm: { conversationId: null, status: "none", canSend: false }, capabilities: { canRequestFriend: true, canRequestDm: true, canBlock: true }, isSelf: false });
describe("mobile social routes", () => {
  beforeEach(() => vi.clearAllMocks());
  it("requests a global friend without inventing a favorite", async () => {
    rpc.mockResolvedValue({ id: other, status: "pending", replayed: false });
    expect((await api.requestFriend(request("/api", { profileId: other, requestId: me }, "POST"))).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("request_social_friend", { p_app_user_id: me, p_profile_id: other, p_celebrity_slug: null, p_request_id: me });
  });
  it("reads the strict profile DTO for the authenticated viewer", async () => {
    const profile = { profile: { id: other, nickname: "팬친구", avatarUrl: "/images/avatars/star-pink.webp", accountLevel: { ruleVersion: "favorite-xp-sum-v1", status: "configured", tier: "Gold", xp: 72, progress: { policyVersion: 2 } } }, favorite: { slug: "elina", name: "엘리나", imageUrl: "/creator.webp", fanXp: 12, fanTier: "Bronze", verified: true }, publicActivityCount: 0, activities: [], activityNextCursor: null, commonFavorites: [], relationship: { friendshipId: null, status: "none", celebritySlug: null }, dm: { conversationId: null, status: "none", canSend: false }, capabilities: { canRequestFriend: true, canRequestDm: true, canBlock: true }, isSelf: false };
    rpc.mockResolvedValue(profile);
    const response = await api.profile(request(`/api?celebritySlug=elina&locale=ko`), other);
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ ...profile, reach: null, card: null });
    expect(rpc).toHaveBeenCalledWith("read_social_fan_profile", { p_app_user_id: me, p_profile_id: other, p_celebrity_slug: "elina", p_locale: "ko", p_before: null, p_before_id: null, p_before_kind: null, p_limit: 12 });
  });
  it("adds the public card for the page it was opened from, and drops a card that breaks the contract", async () => {
    const profile = await minimalProfile();
    const page = "33333333-3333-4333-8333-333333333333";
    const good = { favorite: { slug: "elina", name: "엘리나" }, links: ["https://x.com/fan"], bio: "한 줄", stats: { creator: { slug: "elina", name: "엘리나" }, tier: "Gold", points: 3, stamps: 1, hearts: 2 } };
    rpc.mockImplementation(async (name: string) => name === "read_social_fan_profile" ? profile : name === "read_social_profile_card" ? good : null);
    expect((await (await api.profile(request(`/api?locale=en&pageId=${page}`), other)).json()).card).toEqual(good);
    expect(rpc).toHaveBeenCalledWith("read_social_profile_card", { p_actor: me, p_profile_id: other, p_page_id: page, p_locale: "en" });
    for (const bad of [{ ...good, email: "a@b.c" }, { ...good, links: ["javascript:alert(1)"] }, { ...good, stats: { ...good.stats, amountPaid: 1 } }]) {
      rpc.mockImplementation(async (name: string) => name === "read_social_fan_profile" ? profile : name === "read_social_profile_card" ? bad : null);
      const response = await api.profile(request("/api"), other);
      expect(response.status).toBe(200); expect((await response.json()).card).toBeNull();
    }
    expect((await api.profile(request("/api?pageId=nope"), other)).status).toBe(400);
  });
  it("saves the owned profile fields after checking them, and refuses a bad link before SQL", async () => {
    const saved = { favorite: { slug: "elina", name: "엘리나" }, links: ["https://www.instagram.com/fan"], bio: "한 줄", favoriteOptions: [{ slug: "elina", name: "엘리나" }] };
    rpc.mockResolvedValue(saved);
    const ok = await api.setPublicFields(request("/api?locale=ko", { favoriteSlug: "elina", links: [" https://www.instagram.com/fan "], bio: " 한 줄 " }, "PUT"));
    expect(ok.status).toBe(200); expect(await ok.json()).toEqual(saved);
    expect(rpc).toHaveBeenCalledWith("set_owned_fan_profile_public", { p_app_user_id: me, p_favorite_slug: "elina", p_links: ["https://www.instagram.com/fan"], p_bio: "한 줄", p_locale: "ko" });
    rpc.mockClear();
    for (const bad of [{ favoriteSlug: null, links: ["http://x.com/a"], bio: null }, { favoriteSlug: null, links: [], bio: "a\nb" }, { favoriteSlug: null, links: [], bio: null, email: "x" }]) {
      expect((await api.setPublicFields(request("/api", bad, "PUT"))).status).toBe(400);
    }
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockRejectedValue(new Error("PROFILE_INVALID_REQUEST"));
    expect((await api.setPublicFields(request("/api", { favoriteSlug: "other", links: [], bio: null }, "PUT"))).status).toBe(400);
    rpc.mockResolvedValue({ ...saved, email: "x" });
    expect((await api.readPublicFields(request("/api"))).status).toBe(503);
  });
  it("adds the message state from its own read, and survives without it", async () => {
    const profile = await minimalProfile();
    rpc.mockImplementation(async (name: string) => name === "read_social_fan_profile" ? profile : { dmState: "recipient_off", artist: true });
    expect((await (await api.profile(request("/api"), other)).json()).reach).toEqual({ dmState: "recipient_off", artist: true });
    expect(rpc).toHaveBeenCalledWith("read_social_profile_reach", { p_app_user_id: me, p_profile_id: other });
    rpc.mockImplementation(async (name: string) => { if (name === "read_social_fan_profile") return profile; throw new Error("function does not exist"); });
    const response = await api.profile(request("/api"), other);
    expect(response.status).toBe(200); expect((await response.json()).reach).toBeNull();
    rpc.mockImplementation(async (name: string) => name === "read_social_fan_profile" ? profile : { dmState: "unknown", artist: true, email: "x" });
    expect((await (await api.profile(request("/api"), other)).json()).reach).toBeNull();
  });
  it("does not read the message state for a closed profile", async () => {
    rpc.mockResolvedValue(null);
    expect((await api.profile(request("/api"), other)).status).toBe(404);
    expect(rpc).not.toHaveBeenCalledWith("read_social_profile_reach", expect.anything());
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

describe("settings after profiles became public",()=>{
 const setup=()=>{const rpc=vi.fn().mockResolvedValue({profileVisible:true,favoriteSlugs:[],dmPolicy:"requests"}),handlers=createSocialHandlers({rpc,authorize:vi.fn(async()=>({appUserId:"70000000-0000-4000-8000-000000000001"})),authorizeAdmin:vi.fn()} as never);return{rpc,handlers};};
 const put=(body:unknown)=>new Request("https://kyaa.test/api/me/social/settings",{method:"PUT",headers:{authorization:"Bearer x","content-type":"application/json"},body:JSON.stringify(body)});
 it("saves without the old field",async()=>{const s=setup();expect((await s.handlers.setSettings(put({favoriteSlugs:[],dmPolicy:"requests"}))).status).toBe(200);expect(s.rpc).toHaveBeenCalledWith("set_owned_social_settings",expect.objectContaining({p_dm_policy:"requests",p_profile_visible:true}));});
 it("accepts an old client that still sends false, and does not pass it on",async()=>{const s=setup();expect((await s.handlers.setSettings(put({profileVisible:false,favoriteSlugs:[],dmPolicy:"friends"}))).status).toBe(200);expect(s.rpc).toHaveBeenCalledWith("set_owned_social_settings",expect.objectContaining({p_profile_visible:true}));});
 it("still rejects a wrong type and unknown fields",async()=>{for(const body of [{profileVisible:"no",favoriteSlugs:[],dmPolicy:"friends"},{favoriteSlugs:[],dmPolicy:"friends",extra:1}]){const s=setup();expect((await s.handlers.setSettings(put(body))).status).toBe(400);expect(s.rpc).not.toHaveBeenCalled();}});
});
