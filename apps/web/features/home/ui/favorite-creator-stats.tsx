"use client";
import { RewardIcon } from "@/components/fan-ui/reward-icon";
import { creatorRankingSchema, type CreatorRanking } from "@/features/rankings/domain/types";
import { useRankingResource } from "@/features/rankings/ui/use-ranking-resource";
import { fanProfileText } from "@/features/fan-profile/fan-profile-copy";
import type { AppLocale } from "@/i18n/locales";
import styles from "./favorite-creator-stats.module.css";

const parse = (value: unknown): CreatorRanking => creatorRankingSchema.parse(value);
export type FavoriteCreatorStatsMap = ReadonlyMap<string, { jjinfan: number; hearts: number }> | null;

/**
 * True fans and hearts per creator (261107-2 D13): the same all-time creator ranking the home ranking card reads,
 * so both say the same numbers. One heart is one true fan. Null while loading or on failure.
 */
export function useFavoriteCreatorStats(locale: AppLocale): FavoriteCreatorStatsMap {
  const { state } = useRankingResource(`/api/rankings/creators?period=all&locale=${locale}`, parse);
  if (state.status !== "ready") return null;
  return new Map(state.data.rows.map(row => [row.slug, { jjinfan: row.jjinfanCount, hearts: row.score }]));
}

/** `찐팬 12 · ♥ 340` under the creator name. A creator not in the ranking yet shows 0 and 0; the line keeps its height while loading. */
export function FavoriteCreatorStats({ slug, stats, locale, className }: { slug: string; stats: FavoriteCreatorStatsMap; locale: AppLocale; className?: string }) {
  if (!stats) return <p className={[styles.stats, className].filter(Boolean).join(" ")} aria-hidden="true"><span className={styles.placeholder}/></p>;
  const value = stats.get(slug) ?? { jjinfan: 0, hearts: 0 };
  return <p className={[styles.stats, className].filter(Boolean).join(" ")}>
    <span>{fanProfileText(locale, "favCardJjinfan", [value.jjinfan.toLocaleString(locale)])}</span>
    <span aria-hidden="true">·</span>
    <span className={styles.hearts} aria-label={fanProfileText(locale, "favCardHearts", [value.hearts.toLocaleString(locale)])}><RewardIcon kind="heart" alt="" width={14} height={14}/><span aria-hidden="true">{value.hearts.toLocaleString(locale)}</span></span>
  </p>;
}
