"use client";

import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { FanLockedValue } from "@/components/fan-ui/fan-locked-value";
import { managementMembersCopy } from "@/features/groups/ui/management-members-copy";
import { levelLabel } from "@/features/passport/domain/passport-read-model";
import { fanStageLabel, type FanStageProgress } from "../domain/fan-stage";
import type { FanTier } from "../domain/reward-policy";
import type { AppLocale } from "@/i18n/locales";
import styles from "./fan-grade-card.module.css";

/** 팬 등급 카드: 지금 등급의 도장, 이름, 다음 등급까지의 막대. 값은 API에서만 온다. 패스포트가 없으면 브론즈 도장에 잠근 칸을 두고 팬 인증으로 보낸다. */
export function FanGradeCard({ locale, href, tier, stage, step }: { locale: AppLocale; href: string; tier?: FanTier | null; stage?: FanStageProgress | null; step?: { percent: number; text: string } | null }) {
  const label = managementMembersCopy(locale).tier;
  const key = stage?.current.key ?? (tier ? `${tier.toLowerCase()}-1` : "bronze-1");
  const name = stage ? fanStageLabel(locale, stage.current) : tier ? levelLabel(locale, tier) : null;
  const percent = Math.min(100, Math.max(0, step?.percent ?? 0));
  return <Link className={styles.card} href={href as Route} data-fan-grade-card>
    <Image className={styles.stamp} unoptimized src={`/images/passport/tiers/ink-v1/${key}.webp`} width={56} height={56} alt="" />
    <span className={styles.body}>
      <span className={styles.head}><small>{label}</small><strong>{name ?? <FanLockedValue locale={locale} />}</strong></span>
      <span className={styles.bar} role="progressbar" aria-label={step?.text ?? label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}><i style={{ inlineSize: `${percent}%` }} /></span>
      {step ? <span className={styles.next}>{step.text}</span> : null}
    </span>
  </Link>;
}
