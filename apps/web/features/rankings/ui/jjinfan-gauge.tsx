"use client";
import { FanGauge } from "@/components/fan-ui/fan-number";
import { dukjilText } from "@/features/dukjil/ui/dukjil-copy";
import type { AppLocale } from "@/i18n/locales";
import { jjinfanChallengeSchema } from "../domain/types";
import { JjinfanShareButton } from "./jjinfan-share-button";
import { useJjinfanSeed } from "./jjinfan-seed";
import { rankingsText } from "./rankings-copy";
import { useRankingResource } from "./use-ranking-resource";
import styles from "./jjinfan-gauge.module.css";

const parse = (value: unknown) => jjinfanChallengeSchema.parse(value);

/** "11. 30." in the viewer's language from a KST calendar date. */
export function challengeEndDate(endsOn: string, locale: AppLocale) {
  return new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric", timeZone: "UTC" }).format(new Date(`${endsOn}T00:00:00Z`));
}

/**
 * 찐팬 100 챌린지 card (C7) for a creator an administrator turned on: the live count against 100, the bar, the last day and the administrator's one line,
 * and a share action. Off or ended: no card at all, so the tab starts at its chips. Loading or a failed read shows the server's answer when the
 * page has one (JjinfanSeed), otherwise nothing.
 */
export function JjinfanGauge({ slug, locale, name, className }: { slug: string; locale: AppLocale; name?: string; className?: string }) {
  const { state } = useRankingResource(`/api/pages/${encodeURIComponent(slug)}/jjinfan-challenge`, parse);
  // The server's answer holds the place until the client read lands (or if it fails), so the card never appears late and pushes the page.
  const seed = useJjinfanSeed(slug);
  const data = state.status === "ready" ? state.data : seed;
  if (!data || !data.campaign) return null;
  const { count, target, campaign } = data;
  const shown = Math.min(count, target), reached = count >= target;
  const meta = [campaign.endsOn ? rankingsText(locale, "jjUntil", [challengeEndDate(campaign.endsOn, locale)]) : null, campaign.description || null].filter(Boolean).join(" · ");
  const title = rankingsText(locale, "jjTitle");
  return (
    <section className={[styles.gauge, className ?? ""].filter(Boolean).join(" ")} aria-label={title} data-jjinfan-gauge>
      <div className={styles.head}>
        <h2>{title}</h2>
        <JjinfanShareButton slug={slug} name={name ?? slug} locale={locale} />
      </div>
      <p className={styles.count}>
        <span>{dukjilText(locale, "roomJjinfan")}</span>
        <strong>{dukjilText(locale, "gaugeCount", [shown.toLocaleString(locale), target.toLocaleString(locale)])}</strong>
        {reached ? <span className={styles.done}>{rankingsText(locale, "jjDone")}</span> : null}
      </p>
      <FanGauge value={shown} max={target} label={title} />
      {meta ? <p className={styles.meta}>{meta}</p> : null}
    </section>
  );
}
