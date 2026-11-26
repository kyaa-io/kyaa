import { z } from "zod";
import type { HomeBanner } from "./home-banner";

/** The mileage one ad banner click pays a signed-in member (plan decision 10). The database owns the amount; this draws the badge. */
export const AD_REWARD_POINTS = 5;

/** Banners that pay: the ad category, or any banner in the home_mid slot (the admin's external ad slot). Same rule as record_ad_click_reward. */
export function isRewardedAd(banner: Pick<HomeBanner, "category" | "placement">): boolean {
  return banner.category === "ad" || banner.placement === "home_mid";
}

/** GET /api/me/dukjil/ad-reward: today's paid banners and what is left of the 10 a day. */
export const adRewardTodaySchema = z.object({
  kstDate: z.iso.date(), points: z.number().int().positive(), dailyLimit: z.number().int().positive(),
  remaining: z.number().int().nonnegative(), claimed: z.array(z.uuid()),
}).strict();
export type AdRewardToday = z.infer<typeof adRewardTodaySchema>;

/** POST /api/me/dukjil/ad-reward: what this click paid. A replay answers the first click's points with replayed true. */
export const adRewardResultSchema = z.object({
  points: z.number().int().nonnegative(), capped: z.boolean(), reason: z.string().nullable(), replayed: z.boolean(),
}).strict();
export type AdRewardResult = z.infer<typeof adRewardResultSchema>;

export const adRewardRequestSchema = z.object({ bannerId: z.uuid() }).strict();
