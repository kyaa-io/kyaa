import { z } from "zod";

export const runmusicMissionSchema = z.enum(["pre_cheer", "checkin", "cheer", "photo", "quiz"]);
const requestKey = z.uuid();
export const runmusicActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("register"), requestKey }).strict(),
  z.object({ action: z.literal("checkin"), requestKey, code: z.string().trim().min(1).max(128) }).strict(),
  z.object({ action: z.literal("quiz"), requestKey, answer: z.string().trim().min(1).max(100) }).strict(),
  z.object({ action: z.enum(["pre_cheer", "cheer"]), requestKey, body: z.string().trim().min(1).max(1000) }).strict(),
  z.object({ action: z.literal("photo"), requestKey, body: z.string().trim().max(5000), assetIds: z.array(z.uuid()).min(1).max(4) }).strict(),
]);
export const runmusicCampaignSchema = z.object({
  slug: z.literal("runmusic-2026"), published: z.boolean(), registrationOpensAt: z.string(), registrationClosesAt: z.string(),
  eventStartsAt: z.string(), eventEndsAt: z.string(), prizeCount: z.number().int().min(1).max(1000), prizeLabel: z.string(),
  drawn: z.boolean(), resultsPublished: z.boolean(),
}).strict();
export const runmusicStatusSchema = z.object({
  campaign: runmusicCampaignSchema, registered: z.boolean(), missions: z.array(runmusicMissionSchema),
  multiplier: z.union([z.literal(1), z.literal(2)]), tickets: z.number().int().min(0).max(8),
  result: z.enum(["pending", "not_entered", "not_selected", "winner"]), receiptId: z.uuid().nullable(), receivedAt: z.string().nullable(),
}).strict();
export const runmusicSettingsSchema = z.object({
  expectedRevision: z.number().int().positive(),
  published: z.boolean().optional(), registrationOpensAt: z.iso.datetime({ offset: true }).optional(),
  registrationClosesAt: z.iso.datetime({ offset: true }).optional(), eventStartsAt: z.iso.datetime({ offset: true }).optional(),
  eventEndsAt: z.iso.datetime({ offset: true }).optional(), prizeCount: z.number().int().min(1).max(1000).optional(),
  resultsPublished: z.boolean().optional(),
}).strict();
export type RunmusicCampaign = z.infer<typeof runmusicCampaignSchema>;
export type RunmusicStatus = z.infer<typeof runmusicStatusSchema>;
export type RunmusicAction = z.infer<typeof runmusicActionSchema>;
