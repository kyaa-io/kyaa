"use client";

import { useEffect } from "react";
import { WalletCard } from "@/features/group-wallet/ui/wallet-card";
import { GROUP_WALLET_CHANGED_EVENT, useGroupResource } from "@/features/groups/ui/use-group-resource";
import type { AppLocale } from "@/i18n/locales";
import { walletSchema } from "@/server/group-wallet/domain";
import { myHomeText } from "./my-home-copy";
import { GuestLoginAction } from "./guest-login";

const parseWallet = (value: unknown) => walletSchema.parse(value);
const common = (locale: AppLocale) => ({ locale, framed: true, title: myHomeText(locale, "walletTitle"), viewLabel: myHomeText(locale, "viewWallet") });

/** MY 지갑: 덕질과 같은 카드에 머리만 더한다. 내역은 넣지 않고 `지갑 보기`로 보낸다. */
export function MyWalletCard({ locale }: { locale: AppLocale }) {
  const wallet = useGroupResource("/api/me/wallet", parseWallet);
  const { retry } = wallet;
  useEffect(() => {
    window.addEventListener(GROUP_WALLET_CHANGED_EVENT, retry);
    return () => window.removeEventListener(GROUP_WALLET_CHANGED_EVENT, retry);
  }, [retry]);
  const data = wallet.data;
  return <WalletCard {...common(locale)} viewHref={`/my/wallet?locale=${locale}`} state={data ? { kind: "ready", points: data.points, tickets: data.tickets, pointCost: data.pointCost } : wallet.loading ? { kind: "loading" } : { kind: "failed", retry }} />;
}

/** 지갑을 읽는 동안의 카드. */
export function MyWalletCardSkeleton({ locale }: { locale: AppLocale }) {
  return <WalletCard {...common(locale)} viewHref={`/my/wallet?locale=${locale}`} state={{ kind: "loading" }} />;
}

/** 비로그인 지갑 카드. 같은 외곽에 잠긴 잔액과 비율 줄을 두고, 화면의 강조는 이 로그인 하나다. */
export function MyGuestWalletCard({ locale, returnTo }: { locale: AppLocale; returnTo: string }) {
  return <WalletCard {...common(locale)} viewHref={`/benefits?locale=${locale}`} state={{ kind: "guest", action: <GuestLoginAction locale={locale} returnTo={returnTo} variant="primary" fullWidth /> }} />;
}
