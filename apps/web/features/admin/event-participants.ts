import { z } from "zod";

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
  | { event: EventParticipantWindowEvent; slug: string; from: string; to: string };

/** $400 event week (2026-11-16 ~ 11-23). Each day runs 00:00 to 23:59 KST; `to` is the next 00:00 (exclusive). */
export const eventParticipantPresets = [
  { key: "x-opening-1116", event: "page-like", slug: "x-opening-1116", from: "2026-11-16T00:00:00+09:00", to: "2026-11-17T00:00:00+09:00" },
  { key: "elina-onboarding-1117", event: "page-like", slug: "elina", from: "2026-11-17T00:00:00+09:00", to: "2026-11-18T00:00:00+09:00" },
  { key: "changha-onboarding-1118", event: "page-like", slug: "changha", from: "2026-11-18T00:00:00+09:00", to: "2026-11-19T00:00:00+09:00" },
  { key: "yuna-onboarding-1119", event: "page-like", slug: "yuna", from: "2026-11-19T00:00:00+09:00", to: "2026-11-20T00:00:00+09:00" },
  { key: "elina-passport-1120", event: "passport-issued", slug: "elina", from: "2026-11-20T00:00:00+09:00", to: "2026-11-22T00:00:00+09:00" },
  { key: "changha-photo-1122", event: "page-like", slug: "changha", from: "2026-11-22T00:00:00+09:00", to: "2026-11-24T00:00:00+09:00" },
] as const satisfies readonly ({ key: string } & Extract<EventParticipantQuery, { slug: string }>)[];
export type EventParticipantPresetKey = (typeof eventParticipantPresets)[number]["key"];

const instant = z.iso.datetime({ offset: true });
export const eventParticipantSchema = z.object({
  id: z.uuid(),
  nickname: z.string().max(16),
  signedUpAt: instant,
  participatedAt: instant,
  status: z.enum(["completed", "entered", "issued"]),
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
