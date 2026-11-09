"use client";

import { useEffect } from "react";
import { fanLoginHref } from "@/components/login-href";
import { WalletCard, type Slot } from "@/features/group-wallet/ui/wallet-card";
import { GROUP_WALLET_CHANGED_EVENT, useGroupResource } from "@/features/groups/ui/use-group-resource";
import { useSelectedBias } from "@/features/selected-bias/ui/use-selected-bias";
import type { AppLocale } from "@/i18n/locales";
import { walletSchema } from "@/server/group-wallet/domain";
import { myHomeText } from "./my-home-copy";

const parseWallet = (value: unknown) => walletSchema.parse(value);
const title = (locale: AppLocale) => myHomeText(locale, "walletTitle");
const walletHref = (locale: AppLocale) => `/benefits?locale=${locale}#wallet`;

/** MY 내 지갑 (B13): the balances only, as one link to the 덕질 wallet where exchanging happens. Hearts are the favorite's, as in 덕질. */
export function MyWalletCard({ locale }: { locale: AppLocale }) {
  const wallet = useGroupResource("/api/me/wallet", parseWallet), bias = useSelectedBias(locale);
  const { retry } = wallet;
  useEffect(() => {
    window.addEventListener(GROUP_WALLET_CHANGED_EVENT, retry);
    return () => window.removeEventListener(GROUP_WALLET_CHANGED_EVENT, retry);
  }, [retry]);
  const data = wallet.data;
  const hearts: Slot = bias.status === "loading" ? "loading" : bias.selected ? bias.selected.hearts ?? "missing" : 0;
  return <WalletCard locale={locale} title={title(locale)} href={walletHref(locale)} hearts={hearts} state={data ? { kind: "ready", points: data.points, tickets: data.tickets, pointCost: data.pointCost } : wallet.loading ? { kind: "loading" } : { kind: "failed" }} />;
}

/** 지갑을 읽는 동안의 카드(같은 132px). */
export function MyWalletCardSkeleton({ locale }: { locale: AppLocale }) {
  return <WalletCard locale={locale} title={title(locale)} href={walletHref(locale)} hearts="loading" state={{ kind: "loading" }} />;
}

/** 비로그인 지갑 카드: 같은 외곽에 잠긴 숫자 3개, 카드 전체가 로그인으로 간다. */
export function MyGuestWalletCard({ locale, returnTo }: { locale: AppLocale; returnTo: string }) {
  return <WalletCard locale={locale} title={title(locale)} href={fanLoginHref(locale, returnTo)} hearts="locked" state={{ kind: "guest", action: null }} />;
}
