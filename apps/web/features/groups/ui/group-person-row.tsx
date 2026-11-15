"use client";
import { RewardIcon } from "@/components/fan-ui/reward-icon";
import type { ReactNode } from "react";
import { ChevronRight, UserRound } from "lucide-react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanTag } from "@/components/fan-ui/fan-tag";
import { dukjilText } from "@/features/dukjil/ui/dukjil-copy";
import { tierDisplayName } from "@/features/passport/domain/passport-read-model";
import type { AppLocale } from "@/i18n/locales";
import styles from "./group-members.module.css";

/** Grade as a tag beside the name (261107-2 design-r4 7.1). */
export function GroupPersonTier({ tier, locale }: { tier: string; locale: AppLocale }) {
  return <FanTag tone="neutral" className={styles.tierTag}>{tierDisplayName(locale, tier)}</FanTag>;
}

/** Hearts at the row end: the main number of a fan row. One heart is one true fan. */
export function GroupPersonHearts({ hearts, locale }: { hearts: number; locale: AppLocale }) {
  return <span className={styles.rowHearts} aria-label={dukjilText(locale, "missionHearts", [hearts])}><RewardIcon kind="heart" alt="" width={16} height={16}/><span aria-hidden="true">{hearts.toLocaleString(locale)}</span></span>;
}

/** One fan: 56px, avatar 40, a line between rows. A button only when the viewer may open the profile. */
export function GroupPersonRow({ nickname, avatarUrl, badge, meta, rank, rankLabel, score, onOpen, selected }: {
  nickname: string;
  avatarUrl: string | null;
  /** Beside the name on the first line, like the grade tag. */
  badge?: ReactNode;
  meta?: ReactNode;
  rank?: number | null;
  rankLabel?: string;
  score?: ReactNode;
  onOpen?: () => void;
  selected?: boolean;
}) {
  const body = <span className={styles.personBody}>
    {rank != null && <span className={styles.rank} aria-label={rankLabel}>{rank}</span>}
    {avatarUrl ? <img src={avatarUrl} alt="" width={40} height={40} className={styles.avatar}/> : <span className={styles.avatar}><UserRound size={22} aria-hidden="true"/></span>}
    <span className={styles.identity}>{badge == null ? <strong>{nickname}</strong> : <span className={styles.nameLine}><strong>{nickname}</strong>{badge}</span>}{meta != null && <span className={styles.meta}>{meta}</span>}</span>
    {score != null && <strong className={styles.score}>{score}</strong>}
    {onOpen && score == null && <ChevronRight className={styles.chevron} size={18} aria-hidden="true"/>}
  </span>;
  return <li className={styles.item} data-selected={selected || undefined}>
    {onOpen ? <FanAction variant="text" className={styles.person} onClick={onOpen}>{body}</FanAction> : <div className={`${styles.person} ${styles.personStatic}`}>{body}</div>}
  </li>;
}
