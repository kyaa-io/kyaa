import { z } from "zod";
import { publicAuthorTierSchema } from "@/features/rewards/domain/public-author-tier";
import { publicAvatarUrlSchema } from "../../profile/domain/avatar";
import { safeAssetUrlSchema } from "../../live/domain/live-event";

export const celebritySlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120);

const nickname = z.string().min(1).max(80);
const row = z.object({ profileId: z.uuid(), rank: z.number().int().positive(), nickname, avatarUrl: publicAvatarUrlSchema, points: z.number().int().nonnegative(), tier: publicAuthorTierSchema.optional() });
export const LEADERBOARD_MIN_FANS = 100;
export const LEADERBOARD_CATEGORIES = ["all", "knowledge", "live", "mission", "certification"] as const;
export const leaderboardCategorySchema = z.enum(LEADERBOARD_CATEGORIES);
export const fanpageSummarySchema = z.object({
  membershipCount: z.number().int().nonnegative(),
  fanCount: z.number().int().nonnegative().optional(),
  leaderboardAvailable: z.boolean(),
  activity: z.array(z.object({
    kind: z.enum(["joined", "level_up", "first_certification"]), tier: z.enum(["Bronze", "Silver", "Gold", "Platinum", "Diamond"]).nullable(),
    nickname, avatarUrl: publicAvatarUrlSchema, occurredAt: z.iso.datetime({ offset: true }),
  }).strict()).max(6),
  viewerCanParticipate: z.boolean().optional(),
}).strict().superRefine((value, ctx) => {
  const expected = value.fanCount === undefined ? value.membershipCount > 500 : value.fanCount >= LEADERBOARD_MIN_FANS;
  if (value.leaderboardAvailable !== expected) {
    ctx.addIssue({ code: "custom", message: "Leaderboard summary boundary mismatch" });
  }
});
export type FanpageSummary = z.infer<typeof fanpageSummarySchema>;
export const leaderboardSchema = z.object({
  membershipCount: z.number().int().nonnegative(), fanCount: z.number().int().nonnegative().optional(), available: z.boolean(), asOf: z.iso.datetime({ offset: true }),
  rows: z.array(row).max(100), me: row.nullable(),
}).strict().superRefine((value, ctx) => {
  const expected = value.fanCount === undefined ? value.membershipCount > 500 : value.fanCount >= LEADERBOARD_MIN_FANS;
  if (value.available !== expected || (!value.available && (value.rows.length || value.me))) {
    ctx.addIssue({ code: "custom", message: "Leaderboard membership boundary mismatch" });
  }
});
// The server rejects unexpected database fields before returning public rows.
export const leaderboardResponseSchema = leaderboardSchema.safeExtend({
  rows: z.array(row.strict()).max(100),
  me: row.strict().nullable(),
});
export type Leaderboard = z.infer<typeof leaderboardSchema>;
export const commentSchema = z.object({
  id: z.uuid(), body: z.string().min(1).max(1000), nickname, avatarUrl: z.string(),
  createdAt: z.iso.datetime({ offset: true }), isOwner: z.boolean(), editedAt: z.string().nullable().optional(), isFriend: z.boolean().optional(), parentId: z.uuid().nullable().optional(),
  isOfficial: z.boolean().optional(), artist: z.boolean().optional(),
  parentNickname: nickname.nullable().optional(), reactions: z.array(z.object({
    emoji: z.enum(["heart", "thumbs_up", "clap", "laugh", "star"]),
    count: z.number().int().nonnegative(), selected: z.boolean(),
  }).strict()).max(5).optional(),
  /** Top-level comments only, and only with ?fields=replies. */
  replyCount: z.number().int().nonnegative().optional(),
}).strict().superRefine((value, ctx) => {
  const schema = value.isOfficial ? safeAssetUrlSchema : publicAvatarUrlSchema;
  if (!schema.safeParse(value.avatarUrl).success) {
    ctx.addIssue({ code: "custom", path: ["avatarUrl"], message: "Invalid comment avatar URL" });
  }
});
export const commentsSchema = z.object({ total: z.number().int().nonnegative(), comments: z.array(commentSchema).max(50) }).strict();
export type NoticeComments = z.infer<typeof commentsSchema>;
/** `asOfficial` asks for the page's name; the server stores it only for that page's operator or bound artist. */
export const postCommentSchema = z.object({ body: z.string().trim().min(1).max(1000), idempotencyKey: z.uuid(), parentId: z.uuid().optional(), asOfficial: z.boolean().optional() }).strict();
/** The names the signed-in viewer's comment can be posted under on this page. */
export const commentAuthorSchema = z.object({ name: nickname, official: z.object({ name: nickname, avatarUrl: safeAssetUrlSchema }).strict().nullable() }).strict();
export type CommentAuthor = z.infer<typeof commentAuthorSchema>;
export const commentReactionSchema = z.object({
  emoji: z.enum(["heart", "thumbs_up", "clap", "laugh", "star"]), selected: z.boolean(),
}).strict();
export const commentReactionResultSchema = commentReactionSchema.extend({ count: z.number().int().nonnegative() }).strict();
