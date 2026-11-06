"use client";

import { ArrowRight, Coins, Ticket } from "lucide-react";
import { useEffect, useState } from "react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { FanLockedValue } from "@/components/fan-ui/fan-locked-value";
import { walletCopy, ticketSingular } from "@/features/group-wallet/ui/copy";
import { rewardedExchangeCopy } from "@/features/group-wallet/ui/rewarded-copy";
import { WalletExchangeDialog } from "@/features/group-wallet/ui/wallet-screen";
import { GROUP_WALLET_CHANGED_EVENT, useGroupResource } from "@/features/groups/ui/use-group-resource";
import type { AppLocale } from "@/i18n/locales";
import { GROUP_WALLET_POINT_COST, walletSchema } from "@/server/group-wallet/domain";
import { myHomeText } from "./my-home-copy";
import { GuestLoginAction } from "./guest-login";
import styles from "./my-wallet-card.module.css";

const parseWallet = (value: unknown) => walletSchema.parse(value);

/** 비율 줄 `100 P → 1장`. 덕질 지갑 카드와 같은 모양이다. */
function ExchangeRate({ locale, pointCost }: { locale: AppLocale; pointCost: number }) {
  const w = walletCopy(locale);
  return <div className={styles.rate}><span>{pointCost.toLocaleString(locale)} P</span><ArrowRight size={18} aria-hidden="true" /><span>{locale === "ko" ? "1장" : `1 ${ticketSingular[locale] ?? w.tickets}`}</span></div>;
}

function Balance({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return <div className={styles.balance}><dt><span aria-hidden="true">{icon}</span>{label}</dt><dd>{value}</dd></div>;
}

/** MY 지갑 카드: 잔액 2칸, 비율 줄, 교환 버튼 순서. 내역은 넣지 않고 `지갑 보기`로 보낸다. 교환은 덕질과 같은 광고 시청 교환이다. */
export function MyWalletCard({ locale }: { locale: AppLocale }) {
  const wallet = useGroupResource("/api/me/wallet", parseWallet);
  const { retry } = wallet;
  const w = walletCopy(locale);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    window.addEventListener(GROUP_WALLET_CHANGED_EVENT, retry);
    return () => window.removeEventListener(GROUP_WALLET_CHANGED_EVENT, retry);
  }, [retry]);
  const data = wallet.data;
  const loading = wallet.loading && !data;
  const affordable = Boolean(data && data.points >= data.pointCost);
  const pending = <FanSkeleton width={72} height={32} />;
  return <section className={styles.card} aria-label={myHomeText(locale, "walletTitle")}>
    <header><h2>{myHomeText(locale, "walletTitle")}</h2><FanAction variant="text" trailingIcon={<ArrowRight />} href={`/my/wallet?locale=${locale}`}>{myHomeText(locale, "viewWallet")}</FanAction></header>
    <dl>
      <Balance icon={<Coins />} label={w.points} value={data ? `${data.points.toLocaleString(locale)}P` : loading ? pending : "—"} />
      <Balance icon={<Ticket />} label={locale === "ko" ? "모임 응모권" : w.tickets} value={data ? `${data.tickets.toLocaleString(locale)}${locale === "ko" ? "장" : ""}` : loading ? pending : "—"} />
    </dl>
    {wallet.error && !data ? <div className={styles.error} role="alert"><p>{w.error}</p><FanAction onClick={wallet.retry}>{w.retry}</FanAction></div> : <div className={styles.exchange}>
      <ExchangeRate locale={locale} pointCost={data?.pointCost ?? GROUP_WALLET_POINT_COST} />
      <FanAction variant="primary" fullWidth disabled={!affordable} onClick={() => setOpen(true)}>{rewardedExchangeCopy(locale).action}</FanAction>
    </div>}
    <WalletExchangeDialog locale={locale} open={open} onClose={() => setOpen(false)} />
  </section>;
}

/** 비로그인 지갑 카드. 같은 외곽에 잠긴 잔액과 비율 줄을 두고, 화면의 강조는 이 로그인 하나다. */
export function MyGuestWalletCard({ locale, returnTo }: { locale: AppLocale; returnTo: string }) {
  const w = walletCopy(locale);
  return <section className={styles.card} aria-label={myHomeText(locale, "walletTitle")}>
    <header><h2>{myHomeText(locale, "walletTitle")}</h2><FanAction variant="text" trailingIcon={<ArrowRight />} href={`/benefits?locale=${locale}`}>{myHomeText(locale, "viewWallet")}</FanAction></header>
    <dl>
      <Balance icon={<Coins />} label={w.points} value={<FanLockedValue locale={locale} />} />
      <Balance icon={<Ticket />} label={locale === "ko" ? "모임 응모권" : w.tickets} value={<FanLockedValue locale={locale} />} />
    </dl>
    <div className={styles.exchange}>
      <ExchangeRate locale={locale} pointCost={GROUP_WALLET_POINT_COST} />
      <GuestLoginAction locale={locale} returnTo={returnTo} variant="primary" fullWidth />
    </div>
  </section>;
}
