"use client";

import { useEffect, useRef } from "react";
import Link from "../fan-ui/hover-prefetch-link";
import type { Route } from "next";
import { usePathname, useSearchParams } from "next/navigation";
import { RewardIcon } from "@/components/fan-ui/reward-icon";
import { RollingNumber, useChangeFlash } from "@/components/fan-ui/rolling-number";
import { fanLoginHref } from "@/components/login-href";
import { GROUP_WALLET_CHANGED_EVENT, useGroupRequest, useGroupResource } from "@/features/groups/ui/use-group-resource";
import { walletCopy } from "@/features/group-wallet/ui/copy";
import { defaultPassport } from "@/features/selected-bias/domain/selected-bias-pick";
import { useSelectedBias, type SelectedBias } from "@/features/selected-bias/ui/use-selected-bias";
import { fanStageLabel, fanTierEntryKey } from "@/features/rewards/domain/fan-stage";
import { FanTierBadge, FanTierNumeral } from "@/features/rewards/ui/fan-tier-badge";
import { walletSchema } from "@/server/group-wallet/domain";
import type { AppLocale } from "@/i18n/locales";
import { headerStatusCopy } from "./fan-header-status-copy";
import styles from "./fan-header-status.module.css";

const parseWallet = (value: unknown) => walletSchema.parse(value);
const compactNumber = (value: number, locale: AppLocale) => new Intl.NumberFormat(locale, value >= 10_000 ? { notation: "compact", maximumFractionDigits: 1 } : {}).format(value);

/** The named favorite's passport; with none named, the highest-stage passport (대표 11/23 191773: the grade must show at the top right). */
function headerTier(bias: SelectedBias) {
  return bias.status === "ready" ? bias.selected ?? defaultPassport(bias.options) : null;
}

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
  const passport = headerTier(bias);
  const tier = passport?.tier;
  const myHref = `/my?locale=${locale}${passport ? `&passport=${encodeURIComponent(passport.slug)}#my-passport` : ""}`;
  const stageKey = tier ? passport?.stage?.key ?? fanTierEntryKey(tier) : null;
  const grade = tier && stageKey ? fanStageLabel(locale, { tier, subdivision: Number(stageKey.split("-").at(-1)) }) : "";
  const points = wallet.data?.points;
  useChangeFlash(chip, [grade || undefined, points]);
  // A stale authenticated session must never keep a previously read member balance/tier on screen.
  const expired = wallet.failure?.status === 401 || wallet.failure?.status === 403;
  // Signed out (or a session that just ended) the header holds only the small 로그인 link — never the illustrated join chip (user 11/13).
  // Signed in without a favorite the capsule shows the points alone; joining a group is led by the home first-steps banner, not the header.
  if (!auth.authenticated || expired || bias.status === "guest") return <Link className={styles.trigger} href={loginHref}>{w.login}</Link>;
  const summary = [c.status, grade, `${w.points} ${points?.toLocaleString(locale) ?? ""}`].filter(Boolean).join(" · ");
  const format = (value: number) => compactNumber(value, locale);

  return <Link ref={chip} className={styles.trigger} href={myHref as Route} onNavigate={(event) => {
    const currentPage = new URL(window.location.href);
    if (!passport || currentPage.pathname !== "/my" || currentPage.hash !== "#my-passport"
      || currentPage.searchParams.get("passport") !== passport.slug) return;
    // Reopen the favorite even if the viewer selected another passport at this URL.
    event.preventDefault();
    window.dispatchEvent(new Event("hashchange"));
  }} data-header-status="" aria-label={summary}>
    {tier && <span className={styles.grade} data-header-tier={tier} title={grade}><FanTierBadge tier={tier} stageKey={stageKey} locale={locale} size={16} eager /><FanTierNumeral tier={tier} stageKey={stageKey} height={12} /></span>}
    <span className={styles.value}><RewardIcon kind="point" alt="" width={16} height={16} />{points === undefined ? null : <RollingNumber value={points} format={format} />}</span>
  </Link>;
}
