import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { AuthError } from "@/features/auth/domain/auth-errors";
import { createGetPublicHomeFeed } from "./home-feed";

const owner = "00000000-0000-4000-8000-000000000001";
const item = { kind: "cheer", id: owner, body: "Original cheer", nickname: "Fan", avatarUrl: "/images/avatars/star-pink.webp",
  createdAt: "2026-10-19T00:00:00Z", isOwner: false, replyCount: 0, clapCount: 2, viewerClapped: false };
const data = { items: [{ creatorSlug: "elina", creatorName: "엘리나", item }] };
const post = { kind: "fan_post", id: owner, celebritySlug: "elina", body: "Original post", visibility: "public", revision: 1,
  author: { nickname: "Fan", avatarUrl: "/images/avatars/star-pink.webp" }, assets: [], createdAt: item.createdAt,
  updatedAt: item.createdAt, isOwner: false, likeCount: 0, liked: false, commentCount: 0 };
const request = (query = "", token?: string) => new Request(`https://byus.test/api/public/home-feed${query}`, {
  headers: token ? { authorization: token } : undefined,
});
const dependencies = () => ({ rpc: vi.fn().mockResolvedValue(data), authorize: vi.fn().mockResolvedValue({ appUserId: owner }) });

describe("home community feed", () => {
  it("makes one guest RPC across all creators and preserves original content", async () => {
    const deps = dependencies();
    const result = await createGetPublicHomeFeed(deps)(request("?locale=en&userId=untrusted"));
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual(data);
    expect(deps.rpc).toHaveBeenCalledExactlyOnceWith("read_public_home_feed", { p_app_user_id: null, p_locale: "en" });
    expect(deps.authorize).not.toHaveBeenCalled();
    expect(result.headers.get("cache-control")).toBe("private, no-store");
    expect(result.headers.get("vary")).toBe("Authorization");
  });

  it("uses the verified optional bearer owner, never a query owner", async () => {
    const deps = dependencies();
    const result = await createGetPublicHomeFeed(deps)(request("?userId=untrusted", "Bearer token"));
    expect(result.status).toBe(200);
    expect(deps.authorize).toHaveBeenCalledExactlyOnceWith("Bearer token");
    expect(deps.rpc).toHaveBeenCalledExactlyOnceWith("read_public_home_feed", { p_app_user_id: owner, p_locale: "ko" });
  });

  it("accepts the existing public fan-post DTO", async () => {
    const deps = dependencies();
    const posts = { items: [{ creatorSlug: "elina", creatorName: "엘리나", item: post }] };
    deps.rpc.mockResolvedValue(posts);
    const result = await createGetPublicHomeFeed(deps)(request());
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual(posts);
  });

  it("does not fall back to public results when authentication fails", async () => {
    const deps = dependencies();
    deps.authorize.mockRejectedValue(new AuthError("AUTHENTICATION_REQUIRED", 401, "Invalid token"));
    const result = await createGetPublicHomeFeed(deps)(request("", "Bearer invalid"));
    expect(result.status).toBe(401);
    expect(deps.rpc).not.toHaveBeenCalled();
  });

  it.each(["?locale=ja", "?locale=ko&locale=en"])("rejects invalid locale %s without database work", async query => {
    const deps = dependencies();
    expect((await createGetPublicHomeFeed(deps)(request(query))).status).toBe(400);
    expect(deps.rpc).not.toHaveBeenCalled();
  });

  it.each([
    { items: [{ creatorSlug: "elina", creatorName: "엘리나", item: { ...post, visibility: "members" } }] },
    { items: Array(4).fill(data.items[0]) },
  ])("rejects invalid or non-public database output", async raw => {
    const deps = dependencies();
    deps.rpc.mockResolvedValue(raw);
    const result = await createGetPublicHomeFeed(deps)(request());
    expect(result.status).toBe(503);
    expect(await result.json()).toEqual({ error: { code: "FAN_WEB_UNAVAILABLE" } });
  });

  it("returns a valid empty feed and hides database failures", async () => {
    const deps = dependencies();
    deps.rpc.mockResolvedValueOnce({ items: [] }).mockRejectedValueOnce(new Error("private database detail"));
    const handler = createGetPublicHomeFeed(deps);
    expect(await (await handler(request())).json()).toEqual({ items: [] });
    expect(await (await handler(request())).json()).toEqual({ error: { code: "FAN_WEB_UNAVAILABLE" } });
  });
});

it("validates pages and forwards only a bounded page number with the verified viewer", async () => {
  const deps = dependencies();
  deps.rpc.mockResolvedValue({ items: Array(10).fill(data.items[0]), hasMore: true });
  const result = await createGetPublicHomeFeed(deps)(request("?page=2", "Bearer token"));
  expect(result.status).toBe(200);
  expect((await result.json()).items).toHaveLength(10);
  expect(deps.rpc).toHaveBeenCalledExactlyOnceWith("read_public_home_feed_page", { p_app_user_id: owner, p_locale: "ko", p_page: 2 });
  deps.rpc.mockClear();
  for (const query of ["?page=0", "?page=-1", "?page=1.5", "?page=1001", "?page=x", "?page=1&page=2"]) {
    expect((await createGetPublicHomeFeed(deps)(request(query))).status).toBe(400);
  }
  expect(deps.rpc).not.toHaveBeenCalled();
});

it("rejects an oversized paginated database response", async () => {
  const deps = dependencies();
  deps.rpc.mockResolvedValue({ items: Array(11).fill(data.items[0]), hasMore: true });
  expect((await createGetPublicHomeFeed(deps)(request("?page=1"))).status).toBe(503);
});
