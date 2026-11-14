"use client";

import { useEffect, type ReactNode } from "react";
import { FanNumber } from "@/components/fan-ui/fan-number";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { FanText } from "@/components/fan-ui/fan-text";
import { RewardIcon } from "@/components/fan-ui/reward-icon";
import { walletCopy } from "@/features/group-wallet/ui/copy";
import { GROUP_WALLET_CHANGED_EVENT, useGroupResource } from "@/features/groups/ui/use-group-resource";
import { FanTierBadge } from "@/features/rewards/ui/fan-tier-badge";
import { walletSchema } from "@/server/group-wallet/domain";
import type { AppLocale } from "@/i18n/locales";
import type { MySummary } from "../domain/my-summary";
import { myHomeText } from "./my-home-copy";
import { passportTierName, usePassportBook } from "./my-passport-card";
import styles from "./my-stats.module.css";

type Passport = NonNullable<MySummary["creators"][number]["passport"]>;
/** loading: still reading · missing: the read failed (a dash, never a made-up number). */
type Slot = "loading" | "missing" | number;

const parseWallet = (value: unknown) => walletSchema.parse(value);

function Value({ locale, slot }: { locale: AppLocale; slot: Slot }) {
  if (slot === "loading") return <FanSkeleton width={48} height={24} />;
  if (slot === "missing") return <FanText role="item" className={styles.muted}>—</FanText>;
  return <FanNumber size="lg" value={slot} countUp locale={locale} />;
}

/** 스탬프는 앱 어디서나 "지금 채우는 미션북 쪽의 찍힌 칸/칸 수"다(바로 아래 패스포트 카드와 같은 값). 패스포트나 미션북이 없으면 아래 스탬프 기록과 같은 누적 개수. */
function StampValue({ locale, passport, fallback }: { locale: AppLocale; passport: Passport | null | "loading"; fallback: Slot }) {
  const book = usePassportBook(passport && passport !== "loading" ? passport.id : null);
  if (passport === "loading") return <Value locale={locale} slot="loading" />;
  if (passport === null || book.status === "off") return <Value locale={locale} slot={fallback} />;
  if (book.status === "error") return <Value locale={locale} slot="missing" />;
  if (!book.page) return <Value locale={locale} slot="loading" />;
  return <FanNumber size="lg" value={book.page.filled} countUp locale={locale} unit={`/${book.page.slots.length}`} />;
}

function Cell({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return <div className={styles.cell}>
    <dd className={styles.value}>{children}</dd>
    <dt className={styles.label}><span className={styles.icon} aria-hidden="true">{icon}</span><FanText role="meta" className={styles.name}>{label}</FanText></dt>
  </div>;
}

/** MY 숫자 한 줄 (대표 11/14 00:07, 보석 11/14 12:2x): 포인트 · 스탬프 · 등급, 읽기 전용. 하트·응모권은 덕질의 일이라 넣지 않는다.
 *  포인트는 헤더 동전과 같은 /api/me/wallet, 스탬프는 패스포트 카드와 같은 미션북 쪽의 찍힌 칸(없으면 누적 개수), 등급은 MY가 보여 주는 패스포트의 등급이다.
 *  `passport`가 null이면 패스포트가 아직 없는 계정이라 등급은 '없음'. */
export function MyStats({ locale, passport, stamps }: { locale: AppLocale; passport: Passport | null | "loading"; stamps: Slot }) {
  const wallet = useGroupResource("/api/me/wallet", parseWallet);
  const { retry } = wallet;
  useEffect(() => {
    window.addEventListener(GROUP_WALLET_CHANGED_EVENT, retry);
    return () => window.removeEventListener(GROUP_WALLET_CHANGED_EVENT, retry);
  }, [retry]);
  const points: Slot = wallet.data ? wallet.data.points : wallet.error ? "missing" : "loading";
  return <dl className={styles.row} data-block="my-stats">
    <Cell label={walletCopy(locale).points} icon={<RewardIcon kind="point" size={16} />}><Value locale={locale} slot={points} /></Cell>
    <Cell label={myHomeText(locale, "stampsLabel")} icon={<RewardIcon kind="stamp" size={16} />}><StampValue locale={locale} passport={passport} fallback={stamps} /></Cell>
    <Cell label={myHomeText(locale, "tierLabel")} icon={passport && passport !== "loading" ? <FanTierBadge tier={passport.tier} stageKey={passport.stageProgress?.current.key} locale={locale} size={16} /> : <span className={styles.emptyTier} />}>
      {passport === "loading" ? <FanSkeleton width={56} height={24} />
        : passport ? <FanText role="item">{passportTierName(locale, passport)}</FanText>
        : <FanText role="item" className={styles.muted}>{myHomeText(locale, "tierNone")}</FanText>}
    </Cell>
  </dl>;
}
