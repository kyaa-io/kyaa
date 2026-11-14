import { z } from "zod";
import { platformFollowerSchema } from "./platform-followers";

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

/** Home ranking by day (feedback C3). delta = the previous built day's rank minus today's: positive went up, zero = unchanged, null = no comparison (no previous day, or
 * not ranked then). isNew is a separate recent-entry flag. Ranking stage 2 (20261220010000): movement shows from the second built day of the same metric. */
const delta = z.number().int().nullable();
/** Fans: hearts (default of the API) or points earned (20261222140000, any period). Creators: 찐팬 (default of the API), hearts or page likes (any period).
 * The home board asks for points and likes (대표 11/11 01:55). The screens name the metric they show. */
export const HOME_FAN_METRICS = ["hearts", "points"] as const;
export const HOME_CREATOR_METRICS = ["fans", "hearts", "likes"] as const;
/** Home ranking list periods: all = cumulative hearts (default), day = hearts gained today, week = hearts gained over the last seven days. */
export const HOME_RANKING_PERIODS = ["all", "day", "week"] as const;
export type HomeRankingPeriod = (typeof HOME_RANKING_PERIODS)[number];
export type HomeFanMetric = (typeof HOME_FAN_METRICS)[number];
export type HomeCreatorMetric = (typeof HOME_CREATOR_METRICS)[number];
/** ready: today's rows; empty: today is built and nobody is ranked; stale: today is not built yet (or its build failed), the rows are the last built
 * day's; none: nothing built. */
export const HOME_RANKING_STATES = ["ready", "empty", "stale", "none"] as const;
/** r5(R12·R21): the route adds the basis line's values. period is always "day" (the list is today's KST standings, rebuilt every 10 minutes);
 * closesAt = the next KST midnight, when today's standings are kept and tomorrow's start; fetchedAt = when the server answered. Optional so an answer
 * from an older server still parses. state, today, previousDay, failedAt and metric come with 20261220010000; the route always sets metric. */
const homeHead = {
  day: z.string().nullable(), computedAt: timestamp, comparable: z.boolean(),
  period: z.literal("day").optional(), closesAt: z.iso.datetime({ offset: true }).nullable().optional(), fetchedAt: z.iso.datetime({ offset: true }).optional(),
  state: z.enum(HOME_RANKING_STATES).optional(), today: z.string().nullable().optional(), previousDay: z.string().nullable().optional(), failedAt: timestamp.optional(),
};
/** Rows a signed-in reader may ask for (the full ranking page); the home card asks for the default. Signed out, every platform ranking list answers
 * at most five rows on legacy lists; the home list allows ten. */
export const HOME_RANKING_LIMIT = 50;
export const HOME_RANKING_DEFAULT_LIMIT = 20;
export const HOME_GUEST_LIMIT = 5;
/** The creator this fan named on MY (when that page can be named), else the one given the most hearts, named in the viewer's language. */
const favorite = z.object({ slug: z.string(), name: z.string() }).nullable();
const count = z.number().int().min(0);
/** Counted hearts minus the preceding KST calendar day's snapshot, independent of the sort metric.
 * null when that exact day's build is missing; optional only for responses from an older server. */
const dayGain = z.number().int().nullable().optional();
/** Signed-in-only locator. rank is the immutable stored rank, not the viewer-filtered display rank. No member identifier. */
export const homeFanProfileLocatorSchema = z.object({
  kind: z.literal("home_ranking"), day: z.iso.date(), computedAt: z.iso.datetime({ offset: true }),
  metric: z.enum(HOME_FAN_METRICS), rank: z.number().int().positive(),
}).strict();
export type HomeFanProfileLocator = z.infer<typeof homeFanProfileLocatorSchema>;
/** HMAC binds the coordinates to the authenticated viewer without exposing their identifier. */
export const homeFanProfileRefSchema = homeFanProfileLocatorSchema.extend({ signature: z.string().max(128) }).strict();
export type HomeFanProfileRef = z.infer<typeof homeFanProfileRefSchema>;
export const homeFanRankingSchema = z.object({
  ...homeHead,
  metric: z.enum(HOME_FAN_METRICS).optional(),
  /** Days the fan weekGain comparison spans (20261217010000). Optional: absent before that migration. */
  weekGainDays: z.number().int().min(1).max(7).nullable().optional(),
  /** score is the metric's value; hearts and points name the values (both values independent of the sort metric; points null only when that day has no points build). */
  rows: z.array(platformFanRankingRowSchema.extend({ delta, favorite, fans: count.optional(), isNew: z.boolean().optional(), weekGain: z.number().int().nullable().optional(), dayGain, profileRef: homeFanProfileRefSchema.optional(), hearts: count.optional(), points: count.nullable().optional(),
    /** points list only: tickets held now and points earned all time (the row's points are the period's). */
    tickets: count.optional(), totalPoints: count.optional(),
    /** points list only: the fan's check-in dates counted once each, and public posts still visible (read live). */
    attendanceDays: count.optional(), posts: count.optional() })).max(HOME_RANKING_LIMIT),
  me: z.object({ rank: z.number().int().min(1), score: count, inTop: z.boolean(), hearts: count.optional(), points: count.nullable().optional(), delta: delta.optional() }).nullable(),
});
export type HomeFanRanking = z.infer<typeof homeFanRankingSchema>;
export type HomeFanRankingRow = HomeFanRanking["rows"][number];
export const homeCreatorRankingRowSchema = z.object({
  rank: z.number().int().min(1),
  slug: z.string(),
  name: z.string(),
  imageUrl: z.string().nullable(),
  /** The metric's value: 찐팬 on fans, hearts on hearts. Read fans and hearts by name. */
  score: count,
  hearts: count,
  /** No creator point aggregate is defined; the home API returns null. */
  points: count.nullable().optional(),
  /** Fans holding at least one counted heart. Absent from an older database (there score is the 찐팬). */
  fans: count.optional(),
  /** An administrator turned on the 찐팬 100 challenge for this creator. */
  challenge: z.boolean(),
  liveNow: z.boolean().optional(),
  isNew: z.boolean().optional(),
  delta,
  /** The metric gained over the rolling seven days (E2 ①). null on the first day of history. May be negative when fans left. */
  weekGain: z.number().int().nullable(),
  dayGain,
  /** likes list only: page likes in the period and all time. */
  likes: count.optional(),
  totalLikes: count.optional(),
  /** Follower counts the platforms show, confirmed ones only, in a fixed platform order (public: count, rounding and the platform's wording). Absent from an older server. */
  platforms: z.array(platformFollowerSchema).max(12).optional(),
});
export const homeCreatorRankingSchema = z.object({
  ...homeHead,
  metric: z.enum(HOME_CREATOR_METRICS).optional(),
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
  /** Hearts gathered on the page (대표 2026-11-11: the gauge fills by hearts, not by fans); `count` stays the number of 찐팬. */
  hearts: z.number().int().min(0),
  target: z.literal(JJINFAN_CHALLENGE_TARGET),
});
export const activeJjinfanChallengesSchema = z.object({ items: z.array(activeJjinfanChallengeSchema).max(10) });
export type ActiveJjinfanChallenge = z.infer<typeof activeJjinfanChallengeSchema>;
export type ActiveJjinfanChallenges = z.infer<typeof activeJjinfanChallengesSchema>;
