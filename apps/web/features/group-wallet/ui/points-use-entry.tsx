"use client";
import Link from "next/link";
import type { Route } from "next";
import { ArrowRight } from "lucide-react";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import type { AppLocale } from "@/i18n/locales";
import { GROUP_WALLET_POINT_COST } from "@/server/group-wallet/domain";
import { walletCopy } from "./copy";
import { pointsUseTitle } from "./rewarded-copy";
import { WalletRate } from "./wallet-card";
import styles from "./points-use-entry.module.css";

/** 모은 포인트 사용하기: the rate and one link to the 덕질 wallet, where points become raffle tickets. */
export function PointsUseEntry({ locale }: { locale: AppLocale }) {
  const w = walletCopy(locale);
  return <section className={styles.section} aria-label={pointsUseTitle(locale)} data-points-use>
    <FanHeading as="h2">{pointsUseTitle(locale)}</FanHeading>
    <Link className={styles.link} href={`/benefits?locale=${locale}` as Route}>
      <WalletRate locale={locale} pointCost={GROUP_WALLET_POINT_COST} />
      <span className={styles.action}>{w.exchange}<ArrowRight size={16} aria-hidden="true" /></span>
    </Link>
  </section>;
}
