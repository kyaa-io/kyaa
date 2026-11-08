import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const award = vi.hoisted(() => ({ result: null as null | { points: number; stampId: string | null; capped: boolean; reason: string | null; replayed: boolean } }));
vi.mock("@/server/dukjil/award", async (actual) => ({ ...await actual<typeof import("@/server/dukjil/award")>(),
  awardDukjilAction: vi.fn(async () => award.result), awardDukjilActionDetailed: vi.fn(async () => ({ result: award.result })) }));
import { createContentHandlers, type ContentDependencies } from "./routes";

// One reward shape (review r4): { points, stamps, skippedReason? }. The stamp count comes from the award call of this very write; it never changes the points.
const id = "10000000-0000-4000-8000-000000000001", owner = "20000000-0000-4000-8000-000000000001", stamp = "30000000-0000-4000-8000-000000000001";
const post = { id, celebritySlug: "artist", body: "hello", visibility: "public", revision: 1,
  author: { nickname: "Fan", avatarUrl: "/images/avatars/star-pink.webp" }, assets: [], createdAt: "2026-09-26T00:00:00Z", updatedAt: "2026-09-26T00:00:00Z", isOwner: true, likeCount: 0, liked: false, commentCount: 0 };
function deps(amount: number) {
  const rpc = vi.fn(async (name: string) => name === "read_owned_fan_post_reward" ? { amount } : name === "read_fan_post" ? { post } : { id, revision: 1, replayed: false });
  return { rpc, authorize: vi.fn().mockResolvedValue({ appUserId: owner }), authorizeAdmin: vi.fn(), upload: vi.fn(), download: vi.fn(), translate: vi.fn() } as unknown as ContentDependencies;
}
const request = (body: unknown) => new Request("https://byus.test/api/posts", { method: "POST", headers: { authorization: "Bearer token", "content-type": "application/json" }, body: JSON.stringify(body) });
const create = { body: "hi", visibility: "public", assetIds: [], idempotencyKey: id };
const comment = { body: "nice", parentId: null, idempotencyKey: id };

describe("reward stamps on post and comment creation", () => {
  it.each([["posts"], ["comments"]] as const)("adds stamps: 1 to the %s reward when the award stamped", async (kind) => {
    award.result = { points: 20, stampId: stamp, capped: false, reason: null, replayed: false };
    const h = createContentHandlers(deps(20));
    const response = kind === "posts" ? await h.posts(request(create), "artist") : await h.comments(request(comment), id);
    expect(await response.json()).toEqual({ id, revision: 1, replayed: false, reward: { points: 20, stamps: 1 } });
  });
  it("says stamps: 0 when the award stamped nothing or was a replay", async () => {
    for (const result of [{ points: 20, stampId: null, capped: false, reason: null, replayed: false }, { points: 20, stampId: stamp, capped: false, reason: null, replayed: true }, null]) {
      award.result = result;
      const response = await createContentHandlers(deps(20)).posts(request(create), "artist");
      expect(await response.json()).toEqual({ id, revision: 1, replayed: false, reward: { points: 20, stamps: 0 } });
    }
  });
  it("reports a stamp the write really issued even when the points were capped, and says why nothing else was paid", async () => {
    award.result = { points: 0, stampId: stamp, capped: true, reason: "DUKJIL_DAILY_LIMIT", replayed: false };
    expect(await (await createContentHandlers(deps(0)).posts(request(create), "artist")).json()).toEqual({ id, revision: 1, replayed: false, reward: { points: 0, stamps: 1 } });
    award.result = { points: 0, stampId: null, capped: true, reason: "DUKJIL_DAILY_LIMIT", replayed: false };
    expect(await (await createContentHandlers(deps(0)).posts(request(create), "artist")).json()).toEqual({ id, revision: 1, replayed: false, reward: { points: 0, stamps: 0, skippedReason: "daily_limit" } });
  });
});
