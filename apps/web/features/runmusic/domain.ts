import { z } from "zod";

export const runmusicPrizeCodeSchema = z.enum(["andong_yogurt_1l", "starbucks_10000"]);
export const runmusicPrizeSchema = z.object({
  code: runmusicPrizeCodeSchema, label: z.string().min(1), count: z.number().int().positive(),
  imageUrl: z.string().regex(/^\/images\/[a-zA-Z0-9/_-]+\.(?:png|jpg|webp)$/),
}).strict();
export const runmusicCampaignSchema = z.object({
  slug: z.literal("runmusic-2026"), published: z.boolean(),
  entryOpensAt: z.iso.datetime({ offset: true }), entryClosesAt: z.iso.datetime({ offset: true }),
  resultsAt: z.iso.datetime({ offset: true }), prizes: z.array(runmusicPrizeSchema).length(2),
  drawn: z.boolean(), resultsPublished: z.boolean(),
}).strict();
export const runmusicContactSchema = z.object({ saved: z.boolean(), masked: z.string().nullable() }).strict();
export const runmusicStatusSchema = z.object({
  campaign: runmusicCampaignSchema, entered: z.boolean(), liked: z.boolean(), contact: runmusicContactSchema,
  result: z.enum(["pending", "not_entered", "not_selected", "winner"]),
  prizeCode: runmusicPrizeCodeSchema.nullable(), receiptId: z.uuid().nullable(), receivedAt: z.iso.datetime({ offset: true }).nullable(),
}).strict();
export const runmusicKakaoIdSchema = z.string().trim().min(1).max(100).regex(/^[^\u0000-\u001f\u007f]+$/u);
export const runmusicActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("enter"), requestKey: z.uuid() }).strict(),
  z.object({ action: z.literal("save_contact"), requestKey: z.uuid(), kakaoId: runmusicKakaoIdSchema }).strict(),
]);
export const runmusicSettingsSchema = z.object({
  expectedRevision: z.number().int().positive(), published: z.boolean().optional(), autoPublishEnabled: z.boolean().optional(),
}).strict();
export const runmusicAdminStateSchema = z.object({
  campaign: runmusicCampaignSchema, revision: z.number().int().positive(), participantCount: z.number().int().nonnegative(),
  drawId: z.uuid().nullable(), winnerCount: z.number().int().nonnegative(), receivedCount: z.number().int().nonnegative(),
  autoPublishEnabled: z.boolean(),
  winners: z.array(z.object({
    appUserId: z.uuid(), prizeCode: runmusicPrizeCodeSchema, receiptId: z.uuid(), receivedAt: z.iso.datetime({ offset: true }).nullable(),
    contactSaved: z.boolean(), contactMasked: z.string().nullable(),
  }).strict()).max(1000),
  delivery: z.object({ pending: z.number().int().nonnegative(), sent: z.number().int().nonnegative(), failed: z.number().int().nonnegative(), skipped: z.number().int().nonnegative() }).strict(),
}).strict();
export type RunmusicPrizeCode = z.infer<typeof runmusicPrizeCodeSchema>;
export type RunmusicCampaign = z.infer<typeof runmusicCampaignSchema>;
export type RunmusicStatus = z.infer<typeof runmusicStatusSchema>;
export type RunmusicAction = z.infer<typeof runmusicActionSchema>;
export type RunmusicAdminState = z.infer<typeof runmusicAdminStateSchema>;
