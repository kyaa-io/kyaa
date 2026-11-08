import { z } from "zod";

export const RANKING_PERIODS = ["week", "month", "all"] as const;
export type RankingPeriod = (typeof RANKING_PERIODS)[number];
export const PAGE_RANKING_METRICS = ["hearts", "dukjil"] as const;
export type PageRankingMetric = (typeof PAGE_RANKING_METRICS)[number];
export const JJINFAN_CHALLENGE_TARGET = 100;

const periodSchema = z.enum(RANKING_PERIODS);
const timestamp = z.string().nullable();

export const creatorRankingRowSchema = z.object({
  rank: z.number().int().min(1),
  slug: z.string(),
  name: z.string(),
  imageUrl: z.string().nullable(),
  score: z.number().int().min(0),
  jjinfanCount: z.number().int().min(0),
  myHearts: z.number().int().min(0).nullable(),
});
export const creatorRankingSchema = z.object({
  period: periodSchema,
  periodStart: z.string(),
  computedAt: timestamp,
  rows: z.array(creatorRankingRowSchema).max(100),
});
export type CreatorRankingRow = z.infer<typeof creatorRankingRowSchema>;
export type CreatorRanking = z.infer<typeof creatorRankingSchema>;

export const pageRankingRowSchema = z.object({
  rank: z.number().int().min(1),
  score: z.number().int().min(0),
  nickname: z.string(),
  characterId: z.string(),
  isMe: z.boolean(),
});
export const pageRankingSchema = z.object({
  metric: z.enum(PAGE_RANKING_METRICS),
  period: periodSchema,
  periodStart: z.string(),
  computedAt: timestamp,
  rows: z.array(pageRankingRowSchema).max(100),
  me: z.object({ rank: z.number().int().min(1), score: z.number().int().min(0), inTop: z.boolean() }).nullable(),
  /** Present and false only below the 100 active fans rule. */
  available: z.literal(false).optional(),
});
export type PageRankingRow = z.infer<typeof pageRankingRowSchema>;
export type PageRanking = z.infer<typeof pageRankingSchema>;

export const jjinfanChallengeSchema = z.object({
  count: z.number().int().min(0),
  target: z.literal(JJINFAN_CHALLENGE_TARGET),
  /** Set only for a creator an administrator turned on. Title and description are the administrator's words; an old database answers without it. */
  campaign: z.object({ title: z.string().min(1).max(80), description: z.string().max(300), endsOn: z.iso.date().nullable().optional() }).nullable().optional(),
});
export type JjinfanChallenge = z.infer<typeof jjinfanChallengeSchema>;

/** Platform fan ranking (home card, 261107-2 D3): nickname, character and grade only. No amount and no member id. */
export const PLATFORM_FAN_TIERS = ["Bronze", "Silver", "Gold", "Platinum", "Diamond"] as const;
export const platformFanRankingRowSchema = z.object({
  rank: z.number().int().min(1),
  score: z.number().int().min(0),
  nickname: z.string(),
  characterId: z.string(),
  tier: z.enum(PLATFORM_FAN_TIERS).nullable(),
  isMe: z.boolean(),
});
export const platformFanRankingSchema = z.object({
  period: periodSchema,
  periodStart: z.string(),
  computedAt: timestamp,
  rows: z.array(platformFanRankingRowSchema).max(50),
  me: z.object({ rank: z.number().int().min(1), score: z.number().int().min(0), inTop: z.boolean() }).nullable(),
});
export type PlatformFanRankingRow = z.infer<typeof platformFanRankingRowSchema>;
export type PlatformFanRanking = z.infer<typeof platformFanRankingSchema>;

/** Home ranking by day (feedback C3). delta = yesterday's rank minus today's: positive went up, null = no comparison (first seven days or new). */
const delta = z.number().int().nullable();
/** r5(R12·R21): the route adds the basis line's values. period is always "day" (the list is today's KST standings, rebuilt every 10 minutes);
 * closesAt = the next KST midnight, when today's standings are kept and tomorrow's start; fetchedAt = when the server answered. Optional so an answer
 * from an older server still parses. */
const homeHead = {
  day: z.string().nullable(), computedAt: timestamp, comparable: z.boolean(),
  period: z.literal("day").optional(), closesAt: z.iso.datetime({ offset: true }).nullable().optional(), fetchedAt: z.iso.datetime({ offset: true }).optional(),
};
export const HOME_RANKING_LIMIT = 20;
/** The creator this fan gave the most hearts (E2 ②), named in the viewer's language. null: no listed public page qualifies. */
const favorite = z.object({ slug: z.string(), name: z.string() }).nullable();
export const homeFanRankingSchema = z.object({
  ...homeHead,
  /** Days the fan weekGain comparison spans (20261217010000). Optional: absent before that migration. */
  weekGainDays: z.number().int().min(1).max(7).nullable().optional(),
  /** weekGain: hearts gained over the rolling seven days (20261217010000); null on the first day, absent from an older database. */
  rows: z.array(platformFanRankingRowSchema.extend({ delta, favorite, weekGain: z.number().int().nullable().optional() })).max(HOME_RANKING_LIMIT),
  me: z.object({ rank: z.number().int().min(1), score: z.number().int().min(0), inTop: z.boolean() }).nullable(),
});
export type HomeFanRanking = z.infer<typeof homeFanRankingSchema>;
export type HomeFanRankingRow = HomeFanRanking["rows"][number];
export const homeCreatorRankingRowSchema = z.object({
  rank: z.number().int().min(1),
  slug: z.string(),
  name: z.string(),
  imageUrl: z.string().nullable(),
  /** Fans holding at least one counted heart. */
  score: z.number().int().min(0),
  hearts: z.number().int().min(0),
  /** An administrator turned on the 찐팬 100 challenge for this creator. */
  challenge: z.boolean(),
  delta,
  /** 찐팬 gained over the rolling seven days (E2 ①). null on the first day of history. May be negative when fans left. */
  weekGain: z.number().int().nullable(),
});
export const homeCreatorRankingSchema = z.object({
  ...homeHead,
  /** Days the weekGain comparison spans: 7 once a week of days is kept, fewer in the first week, null when there is nothing to compare. */
  weekGainDays: z.number().int().min(1).max(7).nullable(),
  rows: z.array(homeCreatorRankingRowSchema).max(HOME_RANKING_LIMIT),
});
export type HomeCreatorRankingRow = z.infer<typeof homeCreatorRankingRowSchema>;
export type HomeCreatorRanking = z.infer<typeof homeCreatorRankingSchema>;

/** 찐팬 100 challenges an administrator turned on (feedback C7). Title and description are the administrator's words. */
export const activeJjinfanChallengeSchema = z.object({
  slug: z.string(),
  name: z.string(),
  imageUrl: z.string().nullable(),
  title: z.string().min(1).max(80),
  description: z.string().max(300),
  /** Last day (KST) the challenge runs; null when the administrator set none. */
  endsOn: z.iso.date().nullable(),
  count: z.number().int().min(0),
  target: z.literal(JJINFAN_CHALLENGE_TARGET),
});
export const activeJjinfanChallengesSchema = z.object({ items: z.array(activeJjinfanChallengeSchema).max(10) });
export type ActiveJjinfanChallenge = z.infer<typeof activeJjinfanChallengeSchema>;
export type ActiveJjinfanChallenges = z.infer<typeof activeJjinfanChallengesSchema>;
