import { z } from "zod";

export const waveStagePresentationScopeSchema = z.enum(["all", "event-day"]);
const timestamp = z.string().datetime({ offset: true });
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const counts = { reservations: count, passports: count, likes: count, comments: count, engagedFans: count };
const slug = z.enum(["changha", "wena"]);
const onchainSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("unavailable") }).strict(),
  z.object({
    state: z.literal("available"), contractAddress: z.string().regex(/^0x[0-9a-f]{40}$/),
    blockNumber: z.string().regex(/^[0-9]+$/), blockHash: z.string().regex(/^0x[0-9a-f]{64}$/),
    observedAt: timestamp, finality: z.enum(["included", "safe", "finalized"]),
    finalizedBlockNumber: z.string().regex(/^[0-9]+$/).nullable(),
    creators: z.array(z.object({ slug, ...counts }).strict()).length(2)
      .refine(items => items[0]?.slug === "changha" && items[1]?.slug === "wena"),
  }).strict(),
]);
export const waveStagePresentationResponseSchema = z.object({
  asOf: timestamp,
  scope: waveStagePresentationScopeSchema,
  from: timestamp.nullable(),
  to: timestamp,
  eventDate: z.literal("2026-10-22"),
  creators: z.array(z.object({
    slug, name: z.string().min(1), ...counts, pending: count, failed: count,
  }).strict()).length(2).refine((items) => items[0]?.slug === "changha" && items[1]?.slug === "wena"),
  onchain: onchainSchema,
}).strict().refine((value) => {
  const asOf = Date.parse(value.asOf);
  return value.scope === "all"
    ? value.from === null && Date.parse(value.to) === asOf
    : value.from !== null && Date.parse(value.from) === Date.parse("2026-10-21T15:00:00Z")
      && Date.parse(value.to) === Math.min(asOf, Date.parse("2026-10-22T15:00:00Z"));
});
export type WaveStagePresentationScope = z.infer<typeof waveStagePresentationScopeSchema>;
export type WaveStagePresentationResponse = z.infer<typeof waveStagePresentationResponseSchema>;
