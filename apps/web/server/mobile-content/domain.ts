import { z } from "zod";
import { authorSchema, visibilitySchema } from "@/features/fan-posts/domain/content";

export const reactionEmojiSchema = z.enum(["❤", "👏", "✨"]);
export const reactionSummarySchema = z.object({
  emoji: reactionEmojiSchema,
  count: z.number().int().nonnegative(),
  selected: z.boolean(),
}).strict();

export const clipAssetSchema = z.object({
  id: z.uuid(),
  kind: z.enum(["image", "video"]),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  durationSeconds: z.number().positive().max(60).nullable(),
}).strict();

export const fanClipSchema = z.object({
  id: z.uuid(), celebritySlug: z.string(), body: z.string().max(5000), visibility: visibilitySchema,
  revision: z.number().int().positive(), author: authorSchema.extend({
    profileId: z.uuid().nullable().optional(), fanTier: z.string().min(1).max(40).nullable().optional(),
  }), assets: z.array(clipAssetSchema).min(1).max(4),
  createdAt: z.iso.datetime({ offset: true }), updatedAt: z.iso.datetime({ offset: true }), isOwner: z.boolean(),
  likeCount: z.number().int().nonnegative(), liked: z.boolean(), commentCount: z.number().int().nonnegative(),
}).strict();

export const fanClipCommentSchema = z.object({
  id: z.uuid(), clipId: z.uuid(), parentId: z.uuid().nullable(), body: z.string().trim().min(1).max(1000),
  revision: z.number().int().positive(), author: authorSchema, createdAt: z.iso.datetime({ offset: true }),
  isOwner: z.boolean(), reactions: z.array(reactionSummarySchema).max(3),
}).strict();

export const createFanClipSchema = z.object({
  body: z.string().trim().max(5000), visibility: visibilitySchema, assetIds: z.array(z.uuid()).min(1).max(4), idempotencyKey: z.uuid(),
}).strict().refine(value => new Set(value.assetIds).size === value.assetIds.length, "Duplicate asset");

export const createClipCommentSchema = z.object({
  body: z.string().trim().min(1).max(1000), parentId: z.uuid().nullable().default(null), idempotencyKey: z.uuid(),
}).strict();

export const clipWriteResultSchema = z.object({
  id: z.uuid(), revision: z.number().int().positive(), replayed: z.boolean(),
  stamp: z.discriminatedUnion("status", [
    z.object({ status: z.enum(["awarded", "already_awarded"]), stampId: z.uuid(), issuedAt: z.iso.datetime({ offset: true }) }).strict(),
    z.object({ status: z.enum(["preparing", "needs_review"]) }).strict(),
  ]),
  reward: z.discriminatedUnion("status", [
    z.object({ status: z.literal("unconfigured") }).strict(),
    z.object({ status: z.literal("not_eligible"), reason: z.literal("not_first_upload"), policyVersion: z.string() }).strict(),
    z.object({ status: z.literal("awarded"), ticketAmount: z.number().int().positive(), policyVersion: z.string(), ledgerId: z.uuid() }).strict(),
  ]),
}).strict();

export const commentReactionResultSchema = z.object({
  commentId: z.uuid(), reactions: z.array(reactionSummarySchema).max(3),
}).strict();

export const favoriteAlbumItemSchema = z.object({
  id: z.uuid(), sourceType: z.enum(["fan_post", "fan_clip"]), sourceId: z.uuid(),
  kind: z.enum(["image", "video"]), body: z.string().max(5000),
  createdAt: z.iso.datetime({ offset: true }), width: z.number().int().positive(),
  height: z.number().int().positive(), durationSeconds: z.number().positive().max(60).nullable(),
  likeCount: z.number().int().nonnegative(),
}).strict();

export const favoriteAlbumSchema = z.object({
  favorite: z.object({
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    name: z.string().trim().min(1).max(300),
    imageUrl: z.string().min(1).max(2048),
  }).strict(),
  sourceAvailable: z.boolean(), items: z.array(favoriteAlbumItemSchema).max(50), hasMore: z.boolean(),
}).strict();

export type FanClip = z.infer<typeof fanClipSchema>;
export type FanClipComment = z.infer<typeof fanClipCommentSchema>;
