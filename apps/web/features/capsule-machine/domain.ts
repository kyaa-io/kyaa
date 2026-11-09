import type { z } from "zod";
import type { Capsule, capsuleResultSchema } from "@/features/group-capsule/domain";
import type { CapsuleLevel, CapsuleOutcome } from "./palette-art";

/** 2026-11-09 user decision: next week's capsule ships as "준비 중" — the machine runs, the draw buttons stay disabled. */
export const CAPSULE_DRAW_OPEN = false;
/** Rare: the operator's rare mark first; the campaign data has none yet, so a prize at 5% or less (dev notes, decided 2026-11-09). */
export const RARE_MAX_SHARE = 0.05;

export type CapsuleResult = z.infer<typeof capsuleResultSchema>;

/** The one capsule shown at the top of 럭키드로우: the first active campaign, else the first paused one. */
export function pickCampaign(items: readonly Capsule[]): Capsule | null {
  return items.find((item) => item.status === "active") ?? items.find((item) => item.status === "paused") ?? null;
}

/** The share the server draws with (weight / weightTotal) — the shown percentage is this exact value. */
export function probabilityLabel(weight: number, total: number, locale: string) {
  return (weight / total).toLocaleString(locale, { style: "percent", maximumFractionDigits: 4 });
}

export function isRarePrize(weight: number, total: number) {
  return weight / total <= RARE_MAX_SHARE;
}

export function remainingPrizes(capsule: Capsule) {
  return capsule.prizes.reduce((sum, prize) => sum + prize.stock, 0);
}

export function canDrawCount(capsule: Capsule | null, count: 1 | 10, tickets: number | null, drawOpen: boolean) {
  return Boolean(drawOpen && capsule && capsule.status === "active" && tickets !== null && tickets >= count && capsule.prizes.every((prize) => prize.stock >= count));
}

/** Server results → what the machine plays. Unknown prize ids count as a prize (never as rare), so nothing is staged above what was won. */
export function toOutcomes(result: CapsuleResult, capsule: Capsule): CapsuleOutcome[] {
  return [...result.results].sort((a, b) => a.index - b.index).map((item) => {
    if (item.prizeId === null) return { level: 0, imageUrl: null };
    const prize = capsule.prizes.find((candidate) => candidate.id === item.prizeId);
    const level: CapsuleLevel = prize && isRarePrize(prize.weight, capsule.weightTotal) ? 2 : 1;
    return { level, imageUrl: item.imageUrl ?? prize?.imageUrl ?? null };
  });
}

/** 10회 결과 집계: prize name → count, in result order. */
export function tallyPrizes(result: CapsuleResult) {
  const tally = new Map<string, { name: string; count: number }>();
  for (const item of result.results) {
    if (item.prizeId === null) continue;
    const entry = tally.get(item.prizeId) ?? { name: item.name ?? "", count: 0 };
    entry.count++; tally.set(item.prizeId, entry);
  }
  return [...tally.values()];
}
