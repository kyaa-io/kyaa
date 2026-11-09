import type { AppLocale } from "@/i18n/locales";
import { z } from "zod";
import { messages as tierMessages } from "@/i18n/catalogs/features__passport__domain__passport-read-model";
import { FAN_TIERS } from "./reward-policy";

export const FAN_STAGE_KEYS = [
  "bronze-1", "silver-1", "silver-2", "gold-1", "gold-2", "gold-3",
  "platinum-1", "platinum-2", "platinum-3", "platinum-4", "diamond-1",
] as const;
export type FanStageKey = typeof FAN_STAGE_KEYS[number];

export const fanStageSchema = z.object({
  key: z.enum(FAN_STAGE_KEYS),
  tier: z.enum(FAN_TIERS),
  subdivision: z.number().int().min(1).max(4),
  rank: z.number().int().min(1).max(11),
  minimumScore: z.number().int().nonnegative(),
}).strict().superRefine((stage, context) => {
  if (stage.key !== `${stage.tier.toLowerCase()}-${stage.subdivision}` || FAN_STAGE_KEYS[stage.rank - 1] !== stage.key) {
    context.addIssue({ code: "custom", message: "Fan stage identity is inconsistent" });
  }
});

export const fanStageProgressSchema = z.object({
  policyVersion: z.union([z.literal(2), z.literal(3)]),
  current: fanStageSchema,
  next: fanStageSchema.nullable(),
  remaining: z.number().int().nonnegative(),
  progressPercent: z.number().int().min(0).max(100),
  /** What `remaining` counts (20261220050000): filled mission slots up to Silver 2, hearts from Gold, points under policy 1 and 2. */
  unit: z.enum(["stamps", "hearts", "points"]),
}).strict().superRefine((progress, context) => {
  // Slot-reached stages (Silver 1, Silver 2) share the heart minimum 0 with the stage before them.
  if (progress.next
    ? progress.next.rank !== progress.current.rank + 1
      || (progress.unit === "stamps" ? progress.next.minimumScore < progress.current.minimumScore : progress.next.minimumScore <= progress.current.minimumScore)
    : progress.current.key !== "diamond-1" || progress.remaining !== 0 || progress.progressPercent !== 100) {
    context.addIssue({ code: "custom", message: "Fan stage progress is inconsistent" });
  }
});
export type FanStage = z.infer<typeof fanStageSchema>;
export type FanStageProgress = z.infer<typeof fanStageProgressSchema>;

const labels = { Bronze: "브론즈", Silver: "실버", Gold: "골드", Platinum: "플래티넘", Diamond: "다이아몬드" };
export function fanStageLabel(locale: AppLocale, stage: Pick<FanStage, "tier" | "subdivision">): string {
  const translated = {
    Bronze: tierMessages.m860246902e14, Silver: tierMessages.mc0892217f397,
    Gold: tierMessages.me12a6f61ff09, Platinum: tierMessages.me2f02b0acb25,
    Diamond: tierMessages.mcc8c85f578b9,
  };
  const tier = locale === "ko" ? labels[stage.tier] : locale === "en" ? stage.tier : translated[stage.tier][locale];
  return stage.tier === "Bronze" || stage.tier === "Diamond" ? tier : `${tier} ${stage.subdivision}`;
}

/** The major tier's name alone (실버, Silver), for places that speak of the tier rather than a stage. */
export function fanTierName(locale: AppLocale, tier: FanStage["tier"]): string {
  const label = fanStageLabel(locale, { tier, subdivision: 1 });
  return tier === "Bronze" || tier === "Diamond" ? label : label.replace(/\s*1$/, "");
}

/** An old API exposes only the attained major tier; use its entry artwork. */
export function fanTierEntryKey(tier: typeof FAN_TIERS[number]): FanStageKey {
  return `${tier.toLowerCase()}-1` as FanStageKey;
}
