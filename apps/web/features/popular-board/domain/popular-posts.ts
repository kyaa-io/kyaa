import { z } from "zod";

export const popularPostSchema = z.object({
  source: z.enum(["fan", "group"]),
  id: z.string().uuid(),
  pageRef: z.string().min(1),
  pageName: z.string().min(1),
  title: z.string(),
  nickname: z.string(),
  createdAt: z.string().min(1),
  likeCount: z.number().int().nonnegative(),
  commentCount: z.number().int().nonnegative(),
  viewCount: z.number().int().nonnegative().nullable(),
  asset: z.object({ id: z.string().uuid(), width: z.number().int().positive(), height: z.number().int().positive() }).nullable(),
  /** The picture of the page the post is on; the server adds it to each row, absent when the page has none. */
  pageImageUrl: z.string().nullable().optional(),
}).strict();
export type PopularPost = z.infer<typeof popularPostSchema>;

export const popularPostsPageSchema = z.object({
  hasMore: z.boolean(),
  items: z.array(popularPostSchema).max(10),
}).strict();
export type PopularPostsPage = z.infer<typeof popularPostsPageSchema>;
