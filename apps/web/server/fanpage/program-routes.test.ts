import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { AuthError } from "@/features/auth/domain/auth-errors";
import { createProgramHandlers } from "./program-routes";

const slug = "kyaa-wave-fanpage", id = "10000000-0000-4000-8000-000000000001", owner = "20000000-0000-4000-8000-000000000001";
const post = { id, celebritySlug: slug, body: "hello", visibility: "public", revision: 1, author: { nickname: "Fan", avatarUrl: "/images/avatars/star-pink.webp" }, assets: [], createdAt: "2026-10-20T00:00:00Z", updatedAt: "2026-10-20T00:00:00Z", isOwner: false, likeCount: 0, liked: false, commentCount: 0 };
const input = { body: "hello", visibility: "public", assetIds: [id], idempotencyKey: id };
function setup() {
  const deps = { authorize: vi.fn().mockResolvedValue({ appUserId: owner }), rpc: vi.fn() };
  return { deps, handlers: createProgramHandlers(deps) };
}
function request(method = "GET", query = "", body?: unknown, auth = false) {
  return new Request(`https://kyaa.test/api/celebrities/${slug}/programs/live-insight/posts${query}`, { method, headers: { ...(auth ? { authorization: "Bearer token" } : {}), "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
}
describe("Wave program trust boundary", () => {
  it("reads public program pages without authentication and scopes every cursor to its program", async () => {
    const { deps, handlers } = setup(); deps.rpc.mockResolvedValue({ items: [post], hasMore: true });
    const response = await handlers.posts(request("GET", "?locale=en&limit=1"), slug, "live-insight");
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store"); expect(response.headers.get("vary")).toContain("Authorization");
    expect(deps.authorize).not.toHaveBeenCalled();
    expect(deps.rpc).toHaveBeenCalledWith("read_fan_program_posts", { p_app_user_id: null, p_slug: slug, p_program: "live-insight", p_before: null, p_before_id: null, p_limit: 1, p_locale: "en" });
    const { nextCursor } = await response.json();
    expect(JSON.parse(Buffer.from(nextCursor, "base64url").toString())).toEqual({ program: "live-insight", at: post.createdAt, id });
    expect((await handlers.posts(request("GET", `?cursor=${nextCursor}`), slug, "wave-quiz")).status).toBe(400);
    expect(deps.rpc).toHaveBeenCalledTimes(1);
    await handlers.posts(request("GET", `?cursor=${nextCursor}`), slug, "live-insight");
    expect(deps.rpc).toHaveBeenLastCalledWith("read_fan_program_posts", expect.objectContaining({ p_before: post.createdAt, p_before_id: id }));
  });
  it("sends authenticated writes through the program wrapper and forbids client ownership or private posts", async () => {
    const { deps, handlers } = setup(); deps.rpc.mockResolvedValue({ id, revision: 1, replayed: false });
    expect((await handlers.posts(request("POST", "", input, true), slug, "wave-quiz")).status).toBe(201);
    expect(deps.rpc).toHaveBeenCalledWith("save_fan_program_post", { p_app_user_id: owner, p_slug: slug, p_program: "wave-quiz", p_body: "hello", p_visibility: "public", p_asset_ids: [id], p_idempotency_key: id });
    for (const body of [{ ...input, appUserId: id }, { ...input, visibility: "members" }, { ...input, program_notice_id: id }]) {
      expect((await handlers.posts(request("POST", "", body, true), slug, "wave-quiz")).status).toBe(400);
    }
    expect(deps.rpc).toHaveBeenCalledTimes(1);
  });
  it("rejects unrelated creators, keys, oversized bodies and malformed pagination before querying", async () => {
    const { deps, handlers } = setup();
    expect((await handlers.posts(request(), "runmusic", "wave-quiz")).status).toBe(404);
    expect((await handlers.posts(request(), slug, "unknown")).status).toBe(404);
    for (const query of ["?locale=ko&locale=en", "?cursor=bad", "?limit=0", "?limit=51", "?cursor=", "?limit=1&limit=2"]) {
      expect((await handlers.posts(request("GET", query), slug, "wave-quiz")).status).toBe(400);
    }
    expect((await handlers.posts(request("POST", "", { ...input, body: "x".repeat(40_000) }, true), slug, "wave-quiz")).status).toBe(413);
    expect(deps.rpc).not.toHaveBeenCalled();
  });
  it("fails closed on private fields, wrong creator and private visibility in public responses", async () => {
    const { deps, handlers } = setup();
    for (const item of [{ ...post, appUserId: owner }, { ...post, celebritySlug: "runmusic" }, { ...post, visibility: "members" }]) {
      deps.rpc.mockResolvedValue({ items: [item], hasMore: false });
      const response = await handlers.posts(request(), slug, "live-insight");
      expect(response.status).toBe(503); expect(await response.text()).not.toContain(owner);
    }
    deps.rpc.mockResolvedValue(null);
    expect((await handlers.posts(request(), slug, "live-insight")).status).toBe(404);
  });
  it("requires authentication for owned stamps and never accepts a requested owner", async () => {
    const { deps, handlers } = setup();
    deps.authorize.mockRejectedValueOnce(new AuthError("AUTHENTICATION_REQUIRED", 401, "Sign in required"));
    expect((await handlers.stamps(request(), slug)).status).toBe(401); expect(deps.rpc).not.toHaveBeenCalled();
    const stamps = { stamps: [{ program: "wave-quiz", earnedAt: "2026-10-20T00:00:00Z" }] };
    deps.rpc.mockResolvedValue(stamps);
    const response = await handlers.stamps(request("GET", `?appUserId=${id}`, undefined, true), slug);
    expect(response.status).toBe(200); expect(await response.json()).toEqual(stamps);
    expect(deps.rpc).toHaveBeenCalledWith("read_owned_fan_program_stamps", { p_app_user_id: owner, p_slug: slug });
    deps.rpc.mockResolvedValue({ stamps: [{ ...stamps.stamps[0], appUserId: owner }] });
    expect((await handlers.stamps(request("GET", "", undefined, true), slug)).status).toBe(503);
  });
  it.each([["FAN_WEB_CONFLICT", 409], ["CONTENT_REJECTED", 400], ["FAN_WEB_ACTIVE_ACCOUNT_REQUIRED", 403], ["FAN_WEB_RATE_LIMITED", 429]])("preserves %s write failures", async (code, status) => {
    const { deps, handlers } = setup(); deps.rpc.mockRejectedValue(new Error(code));
    expect((await handlers.posts(request("POST", "", input, true), slug, "wave-quiz")).status).toBe(status);
  });
});
