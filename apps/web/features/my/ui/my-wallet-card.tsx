"use client";

import { ChevronRight, Coins } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { useEffect } from "react";
import { FanLockedValue } from "@/components/fan-ui/fan-locked-value";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { walletCopy } from "@/features/group-wallet/ui/copy";
import { GROUP_WALLET_CHANGED_EVENT, useGroupResource } from "@/features/groups/ui/use-group-resource";
import type { AppLocale } from "@/i18n/locales";
import { walletSchema } from "@/server/group-wallet/domain";
import styles from "./my-wallet-card.module.css";

const parseWallet = (value: unknown) => walletSchema.parse(value);

/** MY 지갑 (plan-ux r5.1 3.6, G2): one menu row `지갑 … P 1,431 ›` to the 덕질 balance card. Exchange lives on 덕질 only (R19). */
function WalletRow({ locale, value }: { locale: AppLocale; value: React.ReactNode }) {
  return <Link className={styles.row} href={`/benefits?locale=${locale}` as Route} data-row="menu" data-my-wallet="">
    <Coins size={24} strokeWidth={1.5} aria-hidden="true" data-icon="" data-icon-set="lucide" />
    <span className={styles.label}>{walletCopy(locale).wallet}</span>
    <span className={styles.value} data-metric="asset" data-metric-id="my-wallet-points">{value}</span>
    <ChevronRight size={16} strokeWidth={1.5} className={styles.next} aria-hidden="true" />
  </Link>;
}

export function MyWalletCard({ locale }: { locale: AppLocale }) {
  const wallet = useGroupResource("/api/me/wallet", parseWallet);
  const { retry } = wallet;
  useEffect(() => {
    window.addEventListener(GROUP_WALLET_CHANGED_EVENT, retry);
    return () => window.removeEventListener(GROUP_WALLET_CHANGED_EVENT, retry);
  }, [retry]);
  return <WalletRow locale={locale} value={wallet.data ? `P ${wallet.data.points.toLocaleString(locale)}` : wallet.loading ? <FanSkeleton width={64} height={20} /> : null} />;
}

/** 지갑을 읽는 동안의 행. */
export function MyWalletCardSkeleton({ locale }: { locale: AppLocale }) {
  return <WalletRow locale={locale} value={<FanSkeleton width={64} height={20} />} />;
}

/** 비로그인: 같은 행에 잠긴 값. */
export function MyGuestWalletCard({ locale }: { locale: AppLocale; returnTo?: string }) {
  return <WalletRow locale={locale} value={<FanLockedValue locale={locale} />} />;
}
