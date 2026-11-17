import { z } from "zod";
import { pageLikeEventWindows, passportIssuedEventWindows } from "../reaction/domain/page-like-event";

export const eventParticipantFixedEvents = ["x-mission", "signup-raffle"] as const;
export const eventParticipantWindowEvents = ["page-like", "passport-issued"] as const;
export const eventParticipantEvents = [...eventParticipantFixedEvents, ...eventParticipantWindowEvents] as const;
export type EventParticipantEvent = (typeof eventParticipantEvents)[number];
export type EventParticipantWindowEvent = (typeof eventParticipantWindowEvents)[number];
export const eventParticipantPageSize = 1000;
export const eventParticipantSlugPattern = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** What one list reads: a fixed event, or likes / Passports of one page inside [from, to). */
export type EventParticipantQuery =
  | { event: (typeof eventParticipantFixedEvents)[number] }
  | { event: EventParticipantWindowEvent; slug: string; from: string; to: string; campaign?: string };

/** $400 event week (2026-11-16 ~ 11-23). Each day runs 00:00 to 23:59 KST; `to` is the next 00:00 (exclusive). */
export const eventParticipantPresets = [
  { key: "x-opening-1116", event: "page-like", slug: "x-opening-1116", from: "2026-11-16T00:00:00+09:00", to: "2026-11-17T00:00:00+09:00" },
  { event: "page-like", ...pageLikeEventWindows["elina-onboarding-1117"] },
  { event: "page-like", ...pageLikeEventWindows["changha-onboarding-1118"] },
  { event: "page-like", ...pageLikeEventWindows["yuna-onboarding-1119"] },
  { event: "passport-issued", ...passportIssuedEventWindows["elina-passport-1120"] },
  { event: "page-like", ...pageLikeEventWindows["changha-photo-1122"] },
] as const satisfies readonly ({ key: string } & Extract<EventParticipantQuery, { slug: string }>)[];
export type EventParticipantPresetKey = (typeof eventParticipantPresets)[number]["key"];

const instant = z.iso.datetime({ offset: true });
export const eventParticipantSchema = z.object({
  id: z.uuid(),
  nickname: z.string().max(16),
  signedUpAt: instant,
  participatedAt: instant,
  status: z.enum(["completed", "entered", "issued"]),
  /** First link tag of this member for the campaign; null = none, absent = the list was read without a campaign. */
  sourceTag: z.object({ source: z.string().max(24), content: z.string().max(24) }).nullable().optional(),
});
export const eventSourceTotalSchema = z.object({ source: z.string().max(24), content: z.string().max(24), count: z.number().int().positive() });
export const eventParticipantsSchema = z.object({
  asOf: instant,
  total: z.number().int().nonnegative(),
  rows: z.array(eventParticipantSchema),
  next: z.object({ at: instant, id: z.uuid() }).nullable(),
  sourceTotals: z.array(eventSourceTotalSchema).optional(),
});
export type EventSourceTotal = z.infer<typeof eventSourceTotalSchema>;
export type EventParticipant = z.infer<typeof eventParticipantSchema>;
export type EventParticipantsPage = z.infer<typeof eventParticipantsSchema>;
export type EventParticipantCursor = NonNullable<EventParticipantsPage["next"]>;
