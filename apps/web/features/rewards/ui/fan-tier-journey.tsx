"use client";
import type { ReactNode } from "react";
import { passportBookText } from "@/features/passport/ui/passport-book-copy";
import { levelLabel } from "@/features/passport/domain/passport-read-model";
import type { AppLocale } from "@/i18n/locales";
import { fanStageLabel, type FanStageProgress } from "../domain/fan-stage";
import { FAN_TIERS, type FanTier } from "../domain/reward-policy";
import { FanTierBadge } from "./fan-tier-badge";
import paper from "@/components/fan-ui/passport-paper.module.css";
import styles from "./fan-tier-journey.module.css";

/** The server's values for the next step when no stage projection exists. */
export type FanTierFallback = { nextLevel: FanTier | null; remaining: number; percent: number; maxed: boolean };

/** The way from the fan to the creator: the attained tier fills the line, the large seal and the bar show the current step. Thresholds are never computed here. */
export function FanTierJourney({ locale, tier, stage, fallback, creatorName, currentLabel, topLabel, nextAria, me, creator, children }: {
  locale: AppLocale; tier: FanTier; stage?: FanStageProgress | null; fallback: FanTierFallback; creatorName: string;
  currentLabel: string; topLabel: string; nextAria: string; me: ReactNode; creator: ReactNode; children?: ReactNode;
}) {
  const reached = FAN_TIERS.indexOf(tier);
  const fill = `${(reached / (FAN_TIERS.length - 1)) * 100}%`;
  const nextLabel = stage ? (stage.next ? fanStageLabel(locale, stage.next) : null) : fallback.nextLevel ? levelLabel(locale, fallback.nextLevel) : null;
  const remaining = stage ? stage.remaining : fallback.remaining;
  const percent = stage?.progressPercent ?? fallback.percent;
  const nextTier = stage ? stage.next?.tier ?? null : fallback.nextLevel;
  return <section className={`${paper.palette} ${styles.card}`} aria-labelledby="fan-tier-title" data-fan-tier-journey>
    <h2 id="fan-tier-title">{passportBookText(locale, "tierJourneyTitle", [creatorName])}</h2>
    <div className={styles.path}>
      <span className={styles.end} data-fan-avatar>{me}</span>
      <ol className={styles.stops} style={{ "--tier-fill": fill } as React.CSSProperties}>
        {FAN_TIERS.map((item, index) => <li key={item} data-state={index < reached ? "passed" : index === reached ? "current" : "ahead"} data-next={item === nextTier || undefined} aria-current={index === reached ? "step" : undefined}>
          <FanTierBadge tier={item} locale={locale} size={36} />
          <span>{levelLabel(locale, item)}</span>
        </li>)}
      </ol>
      <span className={styles.end}>{creator}</span>
    </div>
    <div className={styles.now}>
      <FanTierBadge className={styles.seal} tier={tier} stageKey={stage?.current.key} locale={locale} size={88} />
      <div className={styles.nowText}>
        <strong>{passportBookText(locale, "tierNow", [currentLabel])}</strong>
        {nextLabel ? <span>{passportBookText(locale, "tierToNext", [nextLabel, remaining.toLocaleString(locale)])}</span> : <span>{topLabel}</span>}
        <progress aria-label={nextLabel ? nextAria : topLabel} max={100} value={percent} />
      </div>
      {children ? <div className={styles.facts}>{children}</div> : null}
    </div>
  </section>;
}
