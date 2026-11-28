"use client";
import { EarnBadgeCorner } from "@/features/dukjil/ui/earn-badge";
import { DukjilProvider, useDukjil } from "@/features/dukjil/ui/dukjil-provider";
import type { AppLocale } from "@/i18n/locales";
import styles from "./proof-tab-label.module.css";

function Label({ label, locale }: { label: string; locale: AppLocale }) {
  const rule = useDukjil()?.catalog?.rules.proof as { points?: unknown } | undefined;
  // 숫자는 정책 카탈로그의 값만 쓴다. 읽지 못했거나 정책이 꺼져 있으면 배지 없이 글자만 둔다.
  const points = typeof rule?.points === "number" ? rule.points : undefined;
  const highlight = points !== undefined && points >= 1000;
  return <EarnBadgeCorner locale={locale} className={highlight ? `${styles.host} ${styles.highlight}` : styles.host} points={points}>{label}</EarnBadgeCorner>;
}

/** 탭 줄의 `덕후인증` 글자와 정책 포인트 모서리 배지. 머리는 포인트 공급자 밖이라 카탈로그(60초 공유 읽기)만 읽고 오늘 상태는 읽지 않는다. */
export function ProofTabLabel({ label, locale }: { label: string; locale: AppLocale }) {
  return <DukjilProvider locale={locale}><Label label={label} locale={locale} /></DukjilProvider>;
}
