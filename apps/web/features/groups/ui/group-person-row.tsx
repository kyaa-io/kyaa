"use client";
import type { ReactNode } from "react";
import { ChevronRight, UserRound } from "lucide-react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { dukjilText } from "@/features/dukjil/ui/dukjil-copy";
import { levelLabel } from "@/features/passport/domain/passport-read-model";
import { FanTierBadge } from "@/features/rewards/ui/fan-tier-badge";
import { FAN_TIERS, type FanTier } from "@/features/rewards/domain/reward-policy";
import type { AppLocale } from "@/i18n/locales";
import styles from "./group-members.module.css";

const isFanTier = (value: string): value is FanTier => (FAN_TIERS as readonly string[]).includes(value);

/** 등급 도장, 등급 이름, 하트 수. 하트는 팬페이지 밖이나 옛 응답에서 값이 없으면 그리지 않는다. */
export function GroupPersonGrade({ tier, hearts, locale, role }: { tier: string; hearts?: number | null; locale: AppLocale; role?: string }) {
  return <span className={styles.grade}>
    {role ? <span>{role}</span> : null}
    {isFanTier(tier) ? <FanTierBadge tier={tier} locale={locale} size={20}/> : null}
    <span>{isFanTier(tier) ? levelLabel(locale, tier) : tier}</span>
    {hearts == null ? null : <span className={styles.gradeHearts} aria-label={dukjilText(locale, "missionHearts", [hearts])}><img src="/images/economy/heart.svg" alt="" width={16} height={16}/><span aria-hidden="true">{hearts.toLocaleString(locale)}</span></span>}
  </span>;
}

/** One fan: 56px, avatar 40, a line between rows. A button only when the viewer may open the profile. */
export function GroupPersonRow({ nickname, avatarUrl, meta, rank, rankLabel, score, onOpen, selected }: {
  nickname: string;
  avatarUrl: string | null;
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
    <span className={styles.identity}><strong>{nickname}</strong>{meta != null && <span className={styles.meta}>{meta}</span>}</span>
    {score != null && <strong className={styles.score}>{score}</strong>}
    {onOpen && score == null && <ChevronRight className={styles.chevron} size={18} aria-hidden="true"/>}
  </span>;
  return <li className={styles.item} data-selected={selected || undefined}>
    {onOpen ? <FanAction variant="text" className={styles.person} onClick={onOpen}>{body}</FanAction> : <div className={`${styles.person} ${styles.personStatic}`}>{body}</div>}
  </li>;
}
