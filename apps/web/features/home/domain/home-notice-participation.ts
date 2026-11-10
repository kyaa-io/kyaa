import { z } from "zod";
import { authorSchema, createCommentSchema } from "@/features/fan-posts/domain/content";

export const homeNoticeParticipationSchema = z.object({
  reaction: z.enum(["like", "dislike"]).nullable(),
  likeCount: z.number().int().nonnegative(),
  dislikeCount: z.null(),
  commentCount: z.number().int().nonnegative(),
}).strict();
export const homeNoticeCommentSchema = z.object({
  id: z.uuid(), body: z.string().min(1).max(1000), revision: z.number().int().positive(),
  createdAt: z.iso.datetime({ offset: true }), isOwner: z.boolean(), author: authorSchema,
}).strict();
export const homeNoticeCommentPageSchema = z.object({
  items: z.array(homeNoticeCommentSchema).max(20), nextCursor: z.string().nullable(),
}).strict();
export const homeNoticeCommentInputSchema = createCommentSchema.omit({ parentId: true });
export const homeNoticeCommentWriteSchema = z.object({ id: z.uuid(), revision: z.number().int().positive(), replayed: z.boolean() }).strict();
