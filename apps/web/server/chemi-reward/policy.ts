/** Pure policy only. Persisted eligibility must be checked under chemi_lock_user. */
export type ReadingContent = "saju" | "fortune" | "star" | "tarot";

export function readingExp(input: {
  content: ReadingContent;
  isFavorite: boolean;
  isToday: boolean;
  alreadyRewarded: boolean;
  rewardedFavorites: number;
}): number {
  if (!input.isFavorite || !input.isToday || input.alreadyRewarded || input.rewardedFavorites >= 3) return 0;
  return input.content === "saju" ? 20 : 10;
}

/** Counts must be distinct authenticated users, never totals of reading rows. */
export function participationWindow(counts: { today: number; week: number; all: number }):
  { period: "today" | "week" | "all"; count: number } | null {
  if (counts.today >= 7) return { period: "today", count: counts.today };
  if (counts.week >= 7) return { period: "week", count: counts.week };
  return counts.all > 0 ? { period: "all", count: counts.all } : null;
}
