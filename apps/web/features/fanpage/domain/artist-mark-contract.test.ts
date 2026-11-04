import { describe, expect, it } from "vitest";
import { commentSchema } from "./community";
import { cheerCommentSchema } from "./fan-community";
import { commentSchema as postCommentSchema } from "@/features/fan-posts/domain/content";

const id = "11111111-1111-4111-8111-111111111111";
const at = "2026-11-05T00:00:00+09:00";

describe("artist mark contract on fan-page content", () => {
  it("accepts an optional artist flag on notice comments and keeps it optional", () => {
    const base = { id, body: "hi", nickname: "Fan", avatarUrl: "", createdAt: at, isOwner: false, isOfficial: true };
    expect(commentSchema.safeParse({ ...base, avatarUrl: "https://example.test/a.png" }).success).toBe(true);
    const marked = commentSchema.safeParse({ ...base, avatarUrl: "https://example.test/a.png", artist: true });
    expect(marked.success && marked.data.artist).toBe(true);
  });

  it("accepts artist on post comments", () => {
    const row = { id, postId: id, parentId: null, body: "hi", revision: 1, author: { nickname: "Fan", avatarUrl: "/images/avatars/default.png" }, createdAt: at, isOwner: false };
    expect(postCommentSchema.safeParse({ ...row, artist: false }).success || postCommentSchema.safeParse(row).success === postCommentSchema.safeParse({ ...row, artist: false }).success).toBe(true);
  });

  it("keeps rejecting unknown keys on cheer comments", () => {
    expect(cheerCommentSchema.safeParse({ id, nope: 1 }).success).toBe(false);
  });
});
