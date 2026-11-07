"use client";
import { FanLockedRows } from "@/components/fan-ui/fan-locked-value";
import { benefitsRaffleState } from "@/features/groups/ui/group-benefits-copy";
import type { AppLocale } from "@/i18n/locales";
import { GROUP_WALLET_POINT_COST } from "@/server/group-wallet/domain";
import { pointsUseTitle } from "./rewarded-copy";
import { WalletRate } from "./wallet-card";
import styles from "./points-use-soon.module.css";

/** 모은 포인트 사용하기: a place held open with a dimmed preview under one 준비 중 notice. Nothing inside can be pressed. */
export function PointsUseSoon({ locale }: { locale: AppLocale }) {
  return <section className={styles.section} aria-label={pointsUseTitle(locale)} data-points-use-soon>
    <h2 className={styles.title}>{pointsUseTitle(locale)}</h2>
    <div className={styles.box}>
      <div className={styles.preview} aria-hidden="true"><WalletRate locale={locale} pointCost={GROUP_WALLET_POINT_COST} /><FanLockedRows rows={2} /></div>
      <p className={styles.notice}>{benefitsRaffleState(locale, "preparing")}</p>
    </div>
  </section>;
}
