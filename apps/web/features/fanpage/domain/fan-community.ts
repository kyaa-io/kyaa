import { z } from "zod";
import { publicAvatarUrlSchema } from "../../profile/domain/avatar";
const nicknameSchema = z.string().min(1).max(80);
const cheerMessageBaseSchema = z.object({
  id: z.uuid(),
  body: z.string().min(1).max(1000),
  nickname: nicknameSchema,
  avatarUrl: publicAvatarUrlSchema,
  createdAt: z.iso.datetime({ offset: true }),
  isOwner: z.boolean(),
  clapCount: z.number().int().nonnegative(),
  viewerClapped: z.boolean(),
}).strict();

export const fanCommunitySchema = z.object({
  likeCount: z.number().int().nonnegative(),
  fanCount: z.number().int().nonnegative(),
  publicFanCount: z.number().int().nonnegative(),
  fans: z.array(z.object({
    profileId: z.uuid(),
    nickname: nicknameSchema,
    avatarUrl: publicAvatarUrlSchema,
  }).strict()).max(24),
}).strict();

export const cheerReplySchema = cheerMessageBaseSchema;
export type CheerReply = z.infer<typeof cheerReplySchema>;

export const cheerCommentSchema = cheerMessageBaseSchema.extend({
  replyCount: z.number().int().nonnegative(),
}).strict();
export type CheerComment = z.infer<typeof cheerCommentSchema>;

export const cheerPageSchema = z.object({
  total: z.number().int().nonnegative(),
  comments: z.array(cheerCommentSchema).max(20),
  nextCursor: z.string().nullable(),
}).strict();

export const cheerRepliesSchema = z.object({
  total: z.number().int().nonnegative(),
  replies: z.array(cheerReplySchema).max(50),
  nextCursor: z.string().nullable(),
}).strict();

export const postCheerSchema = z.object({
  body: z.string().trim().min(1).max(1000),
  idempotencyKey: z.uuid(),
  replyToId: z.uuid().optional(),
}).strict();

export const setCheerClapSchema = z.object({ selected: z.boolean() }).strict();
