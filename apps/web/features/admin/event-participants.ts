import { z } from "zod";

export const eventParticipantEvents = ["x-mission", "signup-raffle"] as const;
export type EventParticipantEvent = (typeof eventParticipantEvents)[number];
export const eventParticipantPageSize = 1000;

const instant = z.iso.datetime({ offset: true });
export const eventParticipantSchema = z.object({
  id: z.uuid(),
  nickname: z.string().max(16),
  signedUpAt: instant,
  participatedAt: instant,
  status: z.enum(["completed", "entered"]),
});
export const eventParticipantsSchema = z.object({
  asOf: instant,
  total: z.number().int().nonnegative(),
  rows: z.array(eventParticipantSchema),
  next: z.object({ at: instant, id: z.uuid() }).nullable(),
});
export type EventParticipant = z.infer<typeof eventParticipantSchema>;
export type EventParticipantsPage = z.infer<typeof eventParticipantsSchema>;
export type EventParticipantCursor = NonNullable<EventParticipantsPage["next"]>;
