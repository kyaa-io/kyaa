import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const celeb = "40000000-0000-4000-8000-000000000001";
vi.mock("./creator-id", () => ({ resolveCreatorId: async (slug: string) => (slug === "artist" ? "40000000-0000-4000-8000-000000000001" : null) }));
import { createContentHandlers, type ContentDependencies } from "../fan-posts/routes";

const post = "10000000-0000-4000-8000-000000000001", owner = "20000000-0000-4000-8000-000000000001", comment = "30000000-0000-4000-8000-000000000001";
const postRead = { post: { id: post, celebritySlug: "artist", body: "x", visibility: "public", revision: 1, author: { nickname: "F", avatarUrl: "/images/avatars/star-pink.webp" }, assets: [], createdAt: "2026-09-26T00:00:00Z", updatedAt: "2026-09-26T00:00:00Z", isOwner: false, likeCount: 0, liked: false } };
type Mode = "ok" | "draft" | "down";
function setup(mode: Mode = "ok", replayed = false) {
  const rpc = vi.fn(async (name: string, _args?: unknown) => {
    if (name === "record_dukjil_action") { if (mode === "draft") throw new Error("POLICY_INACTIVE"); if (mode === "down") throw new Error("connection reset"); return { points: 1, stampId: null, capped: false, reason: null, replayed: false }; }
    if (name === "save_fan_post") return { id: post, revision: 1, replayed };
    if (name === "post_fan_post_comment") return { id: comment, revision: 1, replayed };
    if (name === "read_fan_post") return postRead;
    return null;
  });
  const deps = { rpc, authorize: vi.fn().mockResolvedValue({ appUserId: owner }), authorizeAdmin: vi.fn(), upload: vi.fn(), download: vi.fn(), translate: vi.fn() } as unknown as ContentDependencies;
  return { rpc, h: createContentHandlers(deps) };
}
const r = (body: unknown) => new Request("https://x.test/api", { method: "POST", headers: { authorization: "Bearer t", "content-type": "application/json" }, body: JSON.stringify(body) });
const awards = (rpc: ReturnType<typeof setup>["rpc"]) => rpc.mock.calls.filter((c) => c[0] === "record_dukjil_action");
const newPost = { body: "twenty characters or more here", visibility: "public", assetIds: [], idempotencyKey: post };

describe("payout wiring", () => {
  it("post: one award call, with chars and hash", async () => {
    const { rpc, h } = setup();
    expect((await h.posts(r(newPost), "artist")).status).toBe(201);
    const calls = awards(rpc);
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toMatchObject({ p_action_key: "post", p_source_key: post, p_celebrity: celeb });
    expect((calls[0][1] as { p_params: { chars: number } }).p_params.chars).toBe(30);
  });
  it("post: bodyHash is 64 lowercase hex and ignores whitespace-only differences", async () => {
    const hash = async (body: string) => { const { rpc, h } = setup(); await h.posts(r({ ...newPost, body }), "artist"); return (awards(rpc)[0][1] as { p_params: { bodyHash: string; chars: number } }).p_params; };
    const a = await hash("twenty characters or more here");
    const b = await hash("  twenty   characters or\nmore here ");
    expect(a.bodyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(b).toEqual(a);
  });
  it("comment: passes the post id as targetKey and a valid hash", async () => {
    const { rpc, h } = setup();
    await h.comments(r({ body: "a comment body here", parentId: null, idempotencyKey: comment }), post);
    const p = (awards(rpc)[0][1] as { p_params: { targetKey: string; bodyHash: string } }).p_params;
    expect(p.targetKey).toBe(post);
    expect(p.bodyHash).toMatch(/^[0-9a-f]{64}$/);
  });
  it("post: replay does not call again", async () => {
    const { rpc, h } = setup("ok", true);
    await h.posts(r(newPost), "artist");
    expect(awards(rpc)).toHaveLength(0);
  });
  it("post: draft policy leaves the post working", async () => {
    const { h } = setup("draft");
    expect((await h.posts(r(newPost), "artist")).status).toBe(201);
  });
  it("post: payout outage never fails the post", async () => {
    const { h } = setup("down");
    expect((await h.posts(r(newPost), "artist")).status).toBe(201);
  });
  it("comment: one award call using the post's creator", async () => {
    const { rpc, h } = setup();
    expect((await h.comments(r({ body: "a comment body here", parentId: null, idempotencyKey: comment }), post)).status).toBe(201);
    const calls = awards(rpc);
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toMatchObject({ p_action_key: "comment", p_source_key: comment, p_celebrity: celeb });
  });
  it("like: pays on like only, never on cancel", async () => {
    const on = setup(); await on.h.like(r({ liked: true }), post);
    expect(awards(on.rpc)).toHaveLength(1);
    expect(awards(on.rpc)[0][1]).toMatchObject({ p_action_key: "reaction", p_source_key: `post-like:${post}` });
    const off = setup(); await off.h.like(r({ liked: false }), post);
    expect(awards(off.rpc)).toHaveLength(0);
  });
  it("like: outage never fails the like", async () => {
    const { h } = setup("down");
    expect((await h.like(r({ liked: true }), post)).status).toBe(200);
  });
});
