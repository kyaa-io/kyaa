import { z } from "zod";

export const waveStagePresentationScopeSchema = z.enum(["all", "event-day"]);
export const waveStagePresentationMissionKeySchema = z.enum([
  "checkin", "event-photo", "fanpage-like", "introduction", "friendship", "dm-greeting",
  "live-cheer", "insight-review", "quiz-correct", "website-cheer",
]);
const timestamp = z.string().datetime({ offset: true });
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const waveStagePresentationResponseSchema = z.object({
  asOf: timestamp,
  scope: waveStagePresentationScopeSchema,
  from: timestamp.nullable(),
  to: timestamp,
  eventDate: z.literal("2026-10-22"),
  creators: z.array(z.object({
    slug: z.enum(["changha", "wena"]), name: z.string().min(1),
    reservations: count, passports: count, likes: count, comments: count, engagedFans: count,
  }).strict()).length(2).refine((items) => items[0]?.slug === "changha" && items[1]?.slug === "wena"),
  missions: z.object({
    participants: count,
    items: z.array(z.object({ key: waveStagePresentationMissionKeySchema, completed: count }).strict()).length(10),
  }).strict().refine(({ participants, items }) => new Set(items.map((item) => item.key)).size === 10 && items.every((item) => item.completed <= participants)),
}).strict().refine((value) => {
  const asOf = Date.parse(value.asOf);
  return value.scope === "all"
    ? value.from === null && Date.parse(value.to) === asOf
    : value.from !== null && Date.parse(value.from) === Date.parse("2026-10-21T15:00:00Z")
      && Date.parse(value.to) === Math.min(asOf, Date.parse("2026-10-22T15:00:00Z"));
});
export type WaveStagePresentationScope = z.infer<typeof waveStagePresentationScopeSchema>;
export type WaveStagePresentationResponse = z.infer<typeof waveStagePresentationResponseSchema>;
