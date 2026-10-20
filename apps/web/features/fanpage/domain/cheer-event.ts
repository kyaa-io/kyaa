import { z } from "zod";

export const cheerEventResponseSchema = z.object({
  event: z.object({
    campaignId: z.uuid(), creatorSlug: z.string(), liveEventId: z.uuid(), liveSlug: z.string(),
    entryOpensAt: z.iso.datetime({ offset: true }), entryClosesAt: z.iso.datetime({ offset: true }),
    liveStartsAt: z.iso.datetime({ offset: true }),
    reservationOpensAt: z.iso.datetime({ offset: true }), reservationClosesAt: z.iso.datetime({ offset: true }),
    reservationAvailable: z.boolean(),
    status: z.enum(["upcoming", "open", "closed"]),
    prizes: z.array(z.object({ benefitId: z.uuid(), title: z.string(), imageUrl: z.string().nullable(), winnerQuantity: z.number().int().positive() }).strict()),
    participation: z.object({ entered: z.boolean(), enteredAt: z.iso.datetime({ offset: true }).nullable(), reserved: z.boolean(), weight: z.union([z.literal(1), z.literal(2)]) }).strict().nullable(),
  }).strict().nullable(),
}).strict();
export type CheerEventResponse = z.infer<typeof cheerEventResponseSchema>;
export const cheerEventRewardsResponseSchema = z.object({
  event: cheerEventResponseSchema.shape.event.unwrap().extend({
    prizes: z.array(cheerEventResponseSchema.shape.event.unwrap().shape.prizes.element.extend({ kind: z.enum(["coffee_chat", "hotel_coffee"]).nullable() }).strict()),
    photocard: z.object({ collectionId: z.uuid(), title: z.string(), eligible: z.boolean().nullable(), assets: z.array(z.object({ id: z.uuid(), width: z.number().int().positive(), height: z.number().int().positive() }).strict()) }).strict().nullable(),
  }).strict().nullable(),
}).strict();
export type CheerEventRewardsResponse = z.infer<typeof cheerEventRewardsResponseSchema>;
export const legacyCheerEventResponseSchema = z.object({
  event: cheerEventResponseSchema.shape.event.unwrap().omit({
    liveStartsAt: true, reservationOpensAt: true, reservationClosesAt: true, reservationAvailable: true,
  }).nullable(),
}).strict();

export const cheerEventParticipantsSchema = z.object({
  entrySource: z.enum(["tickets", "cheer"]), total: z.number().int().nonnegative(), totalWeight: z.number().int().nonnegative(),
  participants: z.array(z.object({ appUserId: z.uuid(), enteredAt: z.iso.datetime({ offset: true }), weight: z.number().int().positive() }).strict()),
  nextOffset: z.number().int().nonnegative().nullable(),
}).strict();
export type CheerEventParticipants = z.infer<typeof cheerEventParticipantsSchema>;
