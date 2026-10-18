import { z } from "zod";

export const participationLocaleSchema = z.enum(["ko", "en"]);
export const participationContextTypeSchema = z.enum(["live", "event", "album"]);
export const participationPostKindSchema = z.enum(["post", "photo", "video", "question", "memory"]);
export const participationEmojiSchema = z.enum(["like", "heart", "laugh", "wow", "sad"]);
export const participationPostWriteSchema = z.object({
  contextType: participationContextTypeSchema, contextId: z.uuid(), postId: z.uuid().nullable().default(null),
  kind: participationPostKindSchema, body: z.string().max(5000).default(""), assetIds: z.array(z.uuid()).max(4).default([]),
  expectedRevision: z.number().int().positive().nullable().default(null), requestKey: z.uuid(),
}).strict();
export const participationPostDeleteSchema = z.object({
  expectedRevision: z.number().int().positive(),
  requestKey: z.uuid(),
}).strict();
export const participationAnswerWriteSchema = z.object({
  body: z.string().trim().min(1).max(5000), requestKey: z.uuid(),
}).strict();
export const participationCommentWriteSchema = z.object({ body: z.string().trim().min(1).max(1000), requestKey: z.uuid() }).strict();
export const participationReactionSchema = z.object({ emoji: participationEmojiSchema.nullable() }).strict();
export const activityStartSchema = z.object({ requestKey: z.uuid() }).strict();
export const activityHeartbeatSchema = z.object({
  expectedVersion: z.number().int().positive(), foreground: z.boolean(), playing: z.boolean(),
  positionMs: z.number().int().nonnegative(), clientMonotonicMs: z.number().int().nonnegative(),
}).strict();
export const voteSubmitSchema = z.object({ optionIds: z.array(z.uuid()).min(1).max(20), requestKey: z.uuid(), expectedPolicyVersion: z.string().trim().min(1).max(80) }).strict();
export const qrResolveSchema = z.object({ rawCode: z.string().min(8).max(512), requestKey: z.uuid() }).strict();
export const qrRequestKeySchema = z.uuid();
