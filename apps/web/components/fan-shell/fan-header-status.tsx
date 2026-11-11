"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import type { Route } from "next";
import { usePathname, useSearchParams } from "next/navigation";
import { RollingNumber, useChangeFlash } from "@/components/fan-ui/rolling-number";
import { fanLoginHref } from "@/components/login-href";
import { GROUP_WALLET_CHANGED_EVENT, useGroupRequest, useGroupResource } from "@/features/groups/ui/use-group-resource";
import { walletCopy } from "@/features/group-wallet/ui/copy";
import { SelectedBiasChip } from "@/features/selected-bias/ui/selected-bias-chip";
import { useSelectedBias } from "@/features/selected-bias/ui/use-selected-bias";
import { fanStageLabel, fanTierEntryKey } from "@/features/rewards/domain/fan-stage";
import { FanTierBadge } from "@/features/rewards/ui/fan-tier-badge";
import { walletSchema } from "@/server/group-wallet/domain";
import type { AppLocale } from "@/i18n/locales";
import { headerStatusCopy } from "./fan-header-status-copy";
import styles from "./fan-header-status.module.css";

const parseWallet = (value: unknown) => walletSchema.parse(value);
const dot = <span aria-hidden="true">·</span>;
const compactNumber = (value: number, locale: AppLocale) => new Intl.NumberFormat(locale, value >= 10_000 ? { notation: "compact", maximumFractionDigits: 1 } : {}).format(value);

/** One header control; account changes remount it so the chip cannot follow another owner. */
export function FanHeaderStatus({ locale }: { locale: AppLocale }) {
  const auth = useGroupRequest();
  return <OwnedHeaderStatus key={auth.ownerKey} locale={locale} />;
}

function OwnedHeaderStatus({ locale }: { locale: AppLocale }) {
  const auth = useGroupRequest();
  const bias = useSelectedBias(locale);
  const wallet = useGroupResource(auth.authenticated ? "/api/me/wallet" : null, parseWallet);
  const retryWallet = wallet.retry;
  const retryBias = bias.retry;
  // A point or heart change (earn, exchange) re-reads both numbers so the chip rolls to the new value without a reload.
  useEffect(() => {
    const refresh = () => { retryWallet(); retryBias(); };
    window.addEventListener(GROUP_WALLET_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(GROUP_WALLET_CHANGED_EVENT, refresh);
  }, [retryWallet, retryBias]);
  const chip = useRef<HTMLAnchorElement>(null);
  const pathname = usePathname() || "/";
  const query = useSearchParams()?.toString();
  const c = headerStatusCopy(locale);
  const w = walletCopy(locale);
  const loginHref = fanLoginHref(locale, `${pathname}${query ? `?${query}` : ""}`);
  const current = bias.status === "ready" ? bias.selected : null;
  const grade = current ? fanStageLabel(locale, { tier: current.tier, subdivision: current.stage?.subdivision ?? Number(fanTierEntryKey(current.tier).split("-").at(-1)) }) : "";
  const hearts = current?.hearts;
  const points = wallet.data?.points;
  useChangeFlash(chip, [grade || undefined, hearts, points]);
  // A stale authenticated session must never keep a previously read member balance/tier on screen.
  const expired = wallet.failure?.status === 401 || wallet.failure?.status === 403;
  if (!auth.authenticated) return <SelectedBiasChip locale={locale} />;
  if (expired || bias.status === "guest") return <Link className={styles.trigger} href={loginHref}>{w.login}</Link>;
  const summary = [c.status, grade, hearts === undefined ? "" : `${c.hearts} ${hearts.toLocaleString(locale)}`, `${w.points} ${points?.toLocaleString(locale) ?? "—"}`].filter(Boolean).join(" · ");
  const format = (value: number) => compactNumber(value, locale);

  return <Link ref={chip} className={styles.trigger} href={`/my?locale=${locale}` as Route} data-header-status="" aria-label={summary}>
    {current && <><FanTierBadge tier={current.tier} stageKey={current.stage?.key} locale={locale} size={16} />{dot}</>}
    {hearts !== undefined && <><span className={styles.value}><img src="/images/economy/heart.svg" alt="" width={16} height={16} /><RollingNumber value={hearts} format={format} /></span>{dot}</>}
    <span className={styles.value}><img src="/images/economy/point-coin.svg" alt="" width={16} height={16} />{points === undefined ? "—" : <RollingNumber value={points} format={format} />}</span>
  </Link>;
}
