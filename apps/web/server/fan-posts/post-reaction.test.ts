import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createContentHandlers, type ContentDependencies } from "./routes";

const id = "10000000-0000-4000-8000-000000000001", owner = "20000000-0000-4000-8000-000000000001";
const post = { id, celebritySlug: "artist", body: "제목\n본문", visibility: "public", revision: 1,
  author: { nickname: "Fan", avatarUrl: "/images/avatars/star-pink.webp" }, assets: [], createdAt: "2026-09-26T00:00:00Z", updatedAt: "2026-09-26T00:00:00Z", isOwner: false, likeCount: 3, liked: false, commentCount: 0 };
function dependencies() {
  return { rpc: vi.fn(), authorize: vi.fn().mockResolvedValue({ appUserId: owner }), authorizeAdmin: vi.fn(), upload: vi.fn(), download: vi.fn(), translate: vi.fn(), translateTexts: vi.fn() } satisfies ContentDependencies;
}
const read = (authenticated = true) => new Request(`https://byus.test/api/posts/${id}?locale=ko`, { headers: authenticated ? { authorization: "Bearer token" } : {} });
const put = (body: unknown) => new Request(`https://byus.test/api/posts/${id}/like`, { method: "PUT", headers: { authorization: "Bearer token", "content-type": "application/json" }, body: JSON.stringify(body) });

describe("post reactions", () => {
  it("adds the reader's choice and passes the dislike count through only as the database answered it", async () => {
    const d = dependencies(), h = createContentHandlers(d);
    d.rpc.mockImplementation(async (name: string) => name === "read_fan_post" ? { post } : name === "read_fan_post_reaction" ? { reaction: "dislike", dislikeCount: null } : null);
    const body = await (await h.post(read(), id)).json();
    expect(body.post).toMatchObject({ reaction: "dislike", dislikeCount: null, likeCount: 3 });
    expect(d.rpc).toHaveBeenCalledWith("read_fan_post_reaction", { p_app_user_id: owner, p_post_id: id });
    d.rpc.mockImplementation(async (name: string) => name === "read_fan_post" ? { post: { ...post, isOwner: true } } : { reaction: null, dislikeCount: 4 });
    expect((await (await h.post(read(), id)).json()).post.dislikeCount).toBe(4);
  });

  it("reads a guest with no actor, so the database can never treat a guest as the author", async () => {
    const d = dependencies(), h = createContentHandlers(d);
    d.rpc.mockImplementation(async (name: string) => name === "read_fan_post" ? { post } : { reaction: null, dislikeCount: null });
    const response = await h.post(read(false), id);
    expect(response.status).toBe(200);
    expect(d.rpc).toHaveBeenCalledWith("read_fan_post_reaction", { p_app_user_id: null, p_post_id: id });
    expect((await response.json()).post.dislikeCount).toBeNull();
  });

  it("keeps the post readable and shows no count when the reaction read fails or answers an unexpected shape", async () => {
    const d = dependencies(), h = createContentHandlers(d);
    d.rpc.mockImplementation(async (name: string) => { if (name === "read_fan_post") return { post }; throw new Error("temporary"); });
    const failed = await (await h.post(read(), id)).json();
    expect(failed.post).not.toHaveProperty("dislikeCount");
    d.rpc.mockImplementation(async (name: string) => name === "read_fan_post" ? { post } : { reaction: "dislike", dislikeCount: 2, voters: [owner] });
    const odd = await (await h.post(read(), id)).json();
    expect(odd.post).not.toHaveProperty("dislikeCount");
    expect(JSON.stringify(odd)).not.toContain("voters");
  });

  it("writes one choice; only a like earns the reaction reward", async () => {
    const d = dependencies(), h = createContentHandlers(d);
    d.rpc.mockImplementation(async (name: string) => name === "set_fan_post_reaction" ? { reaction: "dislike", dislikeCount: null } : null);
    const response = await h.like(put({ reaction: "dislike" }), id);
    expect(await response.json()).toEqual({ reaction: "dislike", dislikeCount: null });
    expect(d.rpc).toHaveBeenCalledWith("set_fan_post_reaction", { p_app_user_id: owner, p_post_id: id, p_reaction: "dislike" });
    expect(d.rpc.mock.calls.map(call => call[0])).toEqual(["set_fan_post_reaction"]);
    d.rpc.mockReset().mockImplementation(async (name: string) => name === "set_fan_post_reaction" ? { reaction: "like", dislikeCount: null } : null);
    await h.like(put({ reaction: "like" }), id);
    // The reward step starts by resolving the post's page.
    expect(d.rpc.mock.calls.map(call => call[0])).toEqual(["set_fan_post_reaction", "read_fan_post"]);
  });

  it("returns a fresh like grant for the shared celebration, and nothing for a replayed or empty grant (261107-2 D8)", async () => {
    const d = Object.assign(dependencies(), { resolveCreatorId: async () => "30000000-0000-4000-8000-000000000003" }), h = createContentHandlers(d);
    let award: unknown = { points: 1, stampId: null, capped: false, reason: null, replayed: false };
    d.rpc.mockImplementation(async (name: string) => name === "set_fan_post_reaction" ? { reaction: "like", dislikeCount: null } : name === "read_fan_post" ? { post } : name === "record_dukjil_action" ? award : null);
    const fresh = await (await h.like(put({ reaction: "like" }), id)).json();
    expect(fresh).toEqual({ reaction: "like", dislikeCount: null, reward: { points: 1, stamps: 0 } });
    award = { points: 0, stampId: null, capped: true, reason: "POINT_CAP", replayed: false };
    expect((await (await h.like(put({ reaction: "like" }), id)).json()).reward).toEqual({ points: 0, stamps: 0, skippedReason: "daily_limit" });
    award = { points: 20, stampId: "40000000-0000-4000-8000-000000000004", capped: false, reason: null, replayed: false };
    expect((await (await h.like(put({ reaction: "like" }), id)).json()).reward).toEqual({ points: 20, stamps: 1 });
    award = { points: 1, stampId: null, capped: false, reason: null, replayed: true };
    expect(await (await h.like(put({ reaction: "like" }), id)).json()).not.toHaveProperty("reward");
    // 20261219040000: a like on your own post answers 0 with SELF_REACTION — no reward key, no skip notice, no failure row.
    award = { points: 0, stampId: null, capped: false, reason: "SELF_REACTION", replayed: false };
    expect(await (await h.like(put({ reaction: "like" }), id)).json()).toEqual({ reaction: "like", dislikeCount: null });
    expect(d.rpc.mock.calls.some(([name]) => name === "record_dukjil_award_failure")).toBe(false);
  });

  it("keys like and comment rewards on the lowercase post id when the path carries upper case (review 2026-11-09)", async () => {
    const { dukjilRequestKey } = await import("@/server/dukjil/award");
    const hexId = "abcdef00-0000-4000-8000-0000000000ab", upper = hexId.toUpperCase(), lowerSource = `post-like:${hexId}`;
    const d = Object.assign(dependencies(), { resolveCreatorId: async () => "30000000-0000-4000-8000-000000000003" }), h = createContentHandlers(d);
    d.rpc.mockImplementation(async (name: string) => name === "set_fan_post_reaction" ? { reaction: "like", dislikeCount: null } : name === "read_fan_post" ? { post }
      : name === "post_fan_post_comment" ? { id: "50000000-0000-4000-8000-000000000005", revision: 1, replayed: false }
      : name === "record_dukjil_action" ? { points: 1, stampId: null, capped: false, reason: null, replayed: false } : null);
    const awards = () => d.rpc.mock.calls.filter(([name]) => name === "record_dukjil_action").map(([, args]) => args);
    const at = (body: unknown) => new Request(`https://byus.test/api/posts/${upper}/like`, { method: "PUT", headers: { authorization: "Bearer token", "content-type": "application/json" }, body: JSON.stringify(body) });
    for (const body of [{ reaction: "like" }, { liked: true }]) {
      d.rpc.mockClear();
      expect((await h.like(at(body), upper)).status).toBe(200);
      expect(awards()).toEqual([expect.objectContaining({ p_action_key: "reaction", p_source_key: lowerSource, p_request_key: dukjilRequestKey(owner, "reaction", lowerSource) })]);
    }
    d.rpc.mockClear();
    const comment = new Request(`https://byus.test/api/posts/${upper}/comments`, { method: "POST", headers: { authorization: "Bearer token", "content-type": "application/json" },
      body: JSON.stringify({ body: "다섯 글자 넘는 댓글", parentId: null, idempotencyKey: "60000000-0000-4000-8000-000000000006" }) });
    expect((await h.comments(comment, upper)).status).toBe(201);
    expect(awards()).toEqual([expect.objectContaining({ p_action_key: "comment", p_params: expect.objectContaining({ targetKey: hexId }) })]);
  });

  it("rejects unknown choices and mixed bodies before touching the database", async () => {
    const d = dependencies(), h = createContentHandlers(d);
    for (const body of [{ reaction: "love" }, { reaction: "like", liked: true }, { reaction: null }, {}])
      expect((await h.like(put(body), id)).status).toBe(400);
    expect(d.rpc).not.toHaveBeenCalled();
  });

  it("keeps the older liked body working for existing clients", async () => {
    const d = dependencies(), h = createContentHandlers(d);
    d.rpc.mockResolvedValue(null);
    expect(await (await h.like(put({ liked: false }), id)).json()).toEqual({ liked: false });
    expect(d.rpc).toHaveBeenCalledWith("set_fan_post_like", { p_app_user_id: owner, p_post_id: id, p_liked: false });
  });
});
