"use client";
import Link from "../../../components/fan-ui/hover-prefetch-link";
import type { Route } from "next";
import { ArrowRight } from "lucide-react";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import type { AppLocale } from "@/i18n/locales";
import { GROUP_WALLET_POINT_COST } from "@/server/group-wallet/domain";
import { walletCopy } from "./copy";
import { pointsViewLabel } from "./rewarded-copy";
import { WalletRate } from "./wallet-card";
import styles from "./points-use-entry.module.css";

/** 모임 home: the wallet title, the rate and one link to the 덕질 wallet (B13: the link opens the wallet; exchanging starts only in its card). */
export function PointsUseEntry({ locale }: { locale: AppLocale }) {
  const w = walletCopy(locale);
  return <section className={styles.section} aria-label={w.wallet} data-points-use>
    <FanHeading as="h2">{w.wallet}</FanHeading>
    <Link className={styles.link} href={`/benefits?locale=${locale}` as Route}>
      <WalletRate locale={locale} pointCost={GROUP_WALLET_POINT_COST} />
      <span className={styles.action}>{pointsViewLabel(locale)}<ArrowRight size={16} aria-hidden="true" /></span>
    </Link>
  </section>;
}
