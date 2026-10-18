import { z } from "zod";

export const cheerEventResponseSchema = z.object({
  event: z.object({
    campaignId: z.uuid(), creatorSlug: z.string(), liveEventId: z.uuid(), liveSlug: z.string(),
    entryOpensAt: z.iso.datetime({ offset: true }), entryClosesAt: z.iso.datetime({ offset: true }),
    status: z.enum(["upcoming", "open", "closed"]),
    prizes: z.array(z.object({ benefitId: z.uuid(), title: z.string(), imageUrl: z.string().nullable(), winnerQuantity: z.number().int().positive() }).strict()),
    participation: z.object({ entered: z.boolean(), enteredAt: z.iso.datetime({ offset: true }).nullable(), reserved: z.boolean(), weight: z.union([z.literal(1), z.literal(2)]) }).strict().nullable(),
  }).strict().nullable(),
}).strict();
export type CheerEventResponse = z.infer<typeof cheerEventResponseSchema>;

export const cheerEventParticipantsSchema = z.object({
  entrySource: z.enum(["tickets", "cheer"]), total: z.number().int().nonnegative(), totalWeight: z.number().int().nonnegative(),
  participants: z.array(z.object({ appUserId: z.uuid(), enteredAt: z.iso.datetime({ offset: true }), weight: z.number().int().positive() }).strict()),
  nextOffset: z.number().int().nonnegative().nullable(),
}).strict();
export type CheerEventParticipants = z.infer<typeof cheerEventParticipantsSchema>;
