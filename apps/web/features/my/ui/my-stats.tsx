"use client";

import { useEffect } from "react";
import { FanNumber } from "@/components/fan-ui/fan-number";
import { FanSurface } from "@/components/fan-ui/fan-surface";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { FanText } from "@/components/fan-ui/fan-text";
import { RewardIcon } from "@/components/fan-ui/reward-icon";
import { walletCopy } from "@/features/group-wallet/ui/copy";
import { GROUP_WALLET_CHANGED_EVENT, useGroupResource } from "@/features/groups/ui/use-group-resource";
import { walletSchema } from "@/server/group-wallet/domain";
import type { AppLocale } from "@/i18n/locales";
import styles from "./my-stats.module.css";

/** loading: still reading · missing: the read failed (a dash, never a made-up number). */
type Slot = "loading" | "missing" | number;

const parseWallet = (value: unknown) => walletSchema.parse(value);

function Value({ locale, slot }: { locale: AppLocale; slot: Slot }) {
  if (slot === "loading") return <FanSkeleton width={48} height={24} />;
  if (slot === "missing") return <FanText role="item" className={styles.muted}>—</FanText>;
  return <FanNumber size="lg" value={slot} countUp locale={locale} />;
}

export function MyStats({ locale }: { locale: AppLocale }) {
  const wallet = useGroupResource("/api/me/wallet", parseWallet);
  const { retry } = wallet;
  useEffect(() => {
    window.addEventListener(GROUP_WALLET_CHANGED_EVENT, retry);
    return () => window.removeEventListener(GROUP_WALLET_CHANGED_EVENT, retry);
  }, [retry]);
  const points: Slot = wallet.data ? wallet.data.points : wallet.error ? "missing" : "loading";
  return <FanSurface as="div" className={styles.surface}><dl className={styles.row} data-block="my-stats">
    <div className={styles.cell}>
      <dt className={styles.label}><RewardIcon kind="point" size={16} /><FanText role="meta">{walletCopy(locale).points}</FanText></dt>
      <dd className={styles.value}><Value locale={locale} slot={points} /></dd>
    </div>
  </dl></FanSurface>;
}
