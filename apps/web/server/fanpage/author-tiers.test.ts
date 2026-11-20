import { expect, it, vi } from "vitest";
import { z } from "zod";
import { commentPageSchema, commentSchema, postPageSchema, postSchema } from "@/features/fan-posts/domain/content";
import { publicAvatarUrlSchema } from "@/features/profile/domain/avatar";
import { authorTierRequestHeaders } from "@/features/rewards/domain/public-author-tier";
import { withAuthorTiers } from "./author-tiers";

const first = "11111111-1111-4111-8111-000000000001";
const second = "11111111-1111-4111-8111-000000000002";
const createdAt = "2026-11-19T12:00:00Z";
const legacyAuthor = z.strictObject({ nickname: z.string().min(1).max(80), avatarUrl: publicAvatarUrlSchema });
const authors = ["팬 하나", "팬 둘"].map((nickname, index) => ({
  id: index === 0 ? first : second,
  author: { nickname, avatarUrl: "/images/avatars/star-cream.webp" },
  body: "본문", createdAt, revision: 1, isOwner: false,
}));
const posts = authors.map(author => ({
  ...author, celebritySlug: "creator", visibility: "public", updatedAt: createdAt,
  assets: [], likeCount: 0, liked: false, commentCount: 0,
}));
const comments = authors.map(author => ({ ...author, postId: first, parentId: null, reactions: [] }));

it.each([
  { name: "read_fan_posts", kind: "post", items: posts, current: postPageSchema,
    legacy: postPageSchema.extend({ items: z.array(postSchema.extend({ author: legacyAuthor })).max(50) }) },
  { name: "read_fan_post_comments", kind: "comment", items: comments, current: commentPageSchema,
    legacy: commentPageSchema.extend({ items: z.array(commentSchema.extend({ author: legacyAuthor })).max(50) }) },
  { name: "read_fan_post_comments_replies", kind: "comment", items: comments, current: commentPageSchema,
    legacy: commentPageSchema.extend({ items: z.array(commentSchema.extend({ author: legacyAuthor })).max(50) }) },
])("keeps the legacy $name response parseable and enriches opted-in requests once", async ({ name, kind, items, current, legacy }) => {
  const rpc = vi.fn(async () => [{ kind, id: first, tier: "Gold" }]);
  const payload = { items, nextCursor: null };
  const url = "https://example.test";
  const oldResponse = await withAuthorTiers(rpc, name, { p_slug: "creator" }, structuredClone(payload), new Request(url));
  expect(legacy.parse(oldResponse)).toEqual(payload);
  expect(rpc).not.toHaveBeenCalled();

  const request = new Request(url, { headers: authorTierRequestHeaders });
  const newResponse = await withAuthorTiers(rpc, name, { p_slug: "creator" }, structuredClone(payload), request);
  expect(rpc).toHaveBeenCalledExactlyOnceWith("read_public_author_passport_tiers", {
    p_post_ids: kind === "post" ? [first, second] : [],
    p_comment_ids: kind === "comment" ? [first, second] : [],
    p_profile_ids: [], p_slug: "creator",
  });
  expect(legacy.safeParse(newResponse).success).toBe(false);
  expect(current.parse(newResponse).items.map(item => item.author.tier)).toEqual(["Gold", undefined]);

  const futurePayload = structuredClone(payload);
  Object.assign(futurePayload.items[0].author, { futureField: true });
  expect(current.parse(futurePayload)).toEqual(payload);
});
