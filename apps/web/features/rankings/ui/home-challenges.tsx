"use client";
import type { Route } from "next";
import Link from "next/link";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import type { AppLocale } from "@/i18n/locales";
import { activeJjinfanChallengesSchema, type ActiveJjinfanChallenge } from "../domain/types";
import { rankingsText } from "./rankings-copy";
import { useRankingResource } from "./use-ranking-resource";
import styles from "./home-challenges.module.css";

const ROWS = 2;
const parse = (value: unknown) => activeJjinfanChallengesSchema.parse(value);
/** The fan page tab that holds the gauge card and the fan list. */
export const challengeHref = (slug: string, locale: AppLocale) => `/${encodeURIComponent(slug)}?tab=members&locale=${locale}` as Route;

/** Up to two: the viewer's own pages first, then the closest to 100. */
export function pickHomeChallenges(items: readonly ActiveJjinfanChallenge[], preferred: ReadonlySet<string>) {
  return [...items].sort((a, b) => Number(preferred.has(b.slug)) - Number(preferred.has(a.slug)) || b.count / b.target - a.count / a.target || a.slug.localeCompare(b.slug)).slice(0, ROWS);
}

/** Home 찐팬 100 challenge (5차 B4 ④): rows of name · `37/100` over a 2px bar, and a secondary `응원하러 가기` (the home's one primary is
 * `팬페이지 보기`, 8장 plan ②). Only challenges an administrator turned on; none, or a failed read: no block. */
export function HomeChallenges({ locale, preferredSlugs = [], headingId = "home-challenges-heading" }: { locale: AppLocale; preferredSlugs?: readonly string[]; headingId?: string }) {
  const { state } = useRankingResource(`/api/rankings/challenges?locale=${locale}`, parse);
  if (state.status === "error" || (state.status === "ready" && state.data.items.length === 0)) return null;
  const title = rankingsText(locale, "jjTitle");
  const items = state.status === "ready" ? pickHomeChallenges(state.data.items, new Set(preferredSlugs)) : [];
  return <section className={styles.card} aria-labelledby={headingId} aria-busy={state.status === "loading" || undefined} data-home-challenges="" data-block="challenge">
    <FanHeading id={headingId}>{title}</FanHeading>
    <ul className={styles.rows}>
      {state.status === "loading" ? <li className={styles.row} aria-hidden="true" data-skeleton=""><FanSkeleton width="40%" height={16} /><FanSkeleton width={96} height={44} /></li>
        : items.map((item) => {
          const shown = Math.min(item.count, item.target);
          return <li key={item.slug} className={styles.row} data-row="challenge">
            <Link className={styles.body} href={challengeHref(item.slug, locale)}>
              <span className={styles.name}>{item.name}</span>
              <span className={styles.count} data-fact="">{shown.toLocaleString(locale)}/{item.target.toLocaleString(locale)}</span>
              <span className={styles.bar} role="meter" aria-label={`${item.name} ${title}`} aria-valuemin={0} aria-valuemax={item.target} aria-valuenow={shown}><span style={{ width: `${(shown / Math.max(1, item.target)) * 100}%` }} /></span>
            </Link>
            <FanAction variant="secondary" href={challengeHref(item.slug, locale)} className={styles.cheer}>{rankingsText(locale, "jjCheer")}</FanAction>
          </li>;
        })}
    </ul>
  </section>;
}
