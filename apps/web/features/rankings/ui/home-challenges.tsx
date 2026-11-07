"use client";
import type { Route } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CreatorAvatar } from "@/components/fan-ui/creator-avatar";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanGauge } from "@/components/fan-ui/fan-number";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { dukjilText } from "@/features/dukjil/ui/dukjil-copy";
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

/** Home "찐팬 100 챌린지" module (C7, design 5.3): only challenges an administrator turned on. None, or a failed read: no module. */
export function HomeChallenges({ locale, preferredSlugs = [], headingId = "home-challenges-heading" }: { locale: AppLocale; preferredSlugs?: readonly string[]; headingId?: string }) {
  const { state } = useRankingResource(`/api/rankings/challenges?locale=${locale}`, parse);
  if (state.status === "error" || (state.status === "ready" && state.data.items.length === 0)) return null;
  const title = rankingsText(locale, "jjTitle");
  const items = state.status === "ready" ? pickHomeChallenges(state.data.items, new Set(preferredSlugs)) : [];
  return <section className={styles.card} aria-labelledby={headingId} aria-busy={state.status === "loading" || undefined} data-home-challenges>
    <FanHeading id={headingId}>{title}</FanHeading>
    <ul className={styles.rows}>
      {state.status === "loading" ? Array.from({ length: ROWS }, (_, i) => <li key={i} className={styles.row} aria-hidden="true"><FanSkeleton shape="circle" width={40} height={40} /><FanSkeleton width="40%" height={16} /></li>)
        : items.map((item) => {
          const shown = Math.min(item.count, item.target);
          return <li key={item.slug}><Link className={styles.row} href={challengeHref(item.slug, locale)}>
            <CreatorAvatar slug={item.slug} src={item.imageUrl} size={40} photos={undefined} />
            <span className={styles.name}>{item.name}</span>
            <FanGauge size="sm" className={styles.gauge} value={shown} max={item.target} label={`${item.name} ${title}`} valueText={dukjilText(locale, "gaugeCount", [shown.toLocaleString(locale), item.target.toLocaleString(locale)])} />
          </Link></li>;
        })}
    </ul>
    {items[0] ? <Link className={styles.cheer} href={challengeHref(items[0].slug, locale)}>{rankingsText(locale, "jjCheer")}<ArrowRight size={16} aria-hidden="true" /></Link> : null}
  </section>;
}
