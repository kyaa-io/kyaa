"use client";

import { ChevronRight, Coins } from "@/components/fan-ui/stan-icons";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import Link from "next/link";
import type { Route } from "next";
import { useEffect } from "react";
import { FanLockedValue } from "@/components/fan-ui/fan-locked-value";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { dukjilText } from "@/features/dukjil/ui/dukjil-copy";
import { GROUP_WALLET_CHANGED_EVENT, useGroupResource } from "@/features/groups/ui/use-group-resource";
import type { AppLocale } from "@/i18n/locales";
import { walletSchema } from "@/server/group-wallet/domain";
import { GuestLoginAction } from "./guest-login";
import styles from "./my-wallet-card.module.css";

const parseWallet = (value: unknown) => walletSchema.parse(value);

/** MY 지갑 (plan-ux r5.1 3.6, G2): one menu row `지갑 … P 1,431 ›` to the 덕질 balance card. Exchange lives on 덕질 only (R19). */
function WalletRow({ locale, value }: { locale: AppLocale; value: React.ReactNode }) {
  return <Link className={styles.row} href={`/benefits?locale=${locale}` as Route} data-row="menu" data-my-wallet="">
    <FanIcon icon={Coins} size={24} />
    <span className={styles.label}>{dukjilText(locale, "myWalletRow")}</span>
    <span className={styles.value} data-metric="asset" data-metric-id="my-wallet-points">{value}</span>
    <FanIcon icon={ChevronRight} size={16} className={styles.next} />
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

/** 비로그인: 같은 행에 잠긴 값, 그 아래 MY의 로그인 하나(비로그인 원칙: 구조 유지 + 로그인 유도). */
export function MyGuestWalletCard({ locale, returnTo }: { locale: AppLocale; returnTo: string }) {
  return <div className={styles.guest}><WalletRow locale={locale} value={<FanLockedValue locale={locale} />} /><GuestLoginAction locale={locale} returnTo={returnTo} variant="primary" fullWidth /></div>;
}
