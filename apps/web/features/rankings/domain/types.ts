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
  campaign: z.object({ title: z.string().min(1).max(80), description: z.string().max(300) }).nullable().optional(),
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
