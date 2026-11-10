"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { usePathname, useSearchParams } from "next/navigation";
import { HeaderPopover } from "@/components/fan-ui/header-popover";
import { FanAction } from "@/components/fan-ui/fan-action";
import { fanLoginHref } from "@/components/login-href";
import { GROUP_WALLET_CHANGED_EVENT, useGroupRequest, useGroupResource } from "@/features/groups/ui/use-group-resource";
import { groupBenefitsCopy } from "@/features/groups/ui/group-benefits-copy";
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
const arrow = <span aria-hidden="true">›</span>;
const dot = <span aria-hidden="true">·</span>;
const compactNumber = (value: number, locale: AppLocale) => new Intl.NumberFormat(locale, value >= 10_000 ? { notation: "compact", maximumFractionDigits: 1 } : {}).format(value);

/** One header control; account changes remount it so an open panel cannot follow another owner. */
export function FanHeaderStatus({ locale }: { locale: AppLocale }) {
  const auth = useGroupRequest();
  return <OwnedHeaderStatus key={auth.ownerKey} locale={locale} />;
}

function OwnedHeaderStatus({ locale }: { locale: AppLocale }) {
  const auth = useGroupRequest();
  const bias = useSelectedBias(locale);
  const wallet = useGroupResource(auth.authenticated ? "/api/me/wallet" : null, parseWallet);
  const retryWallet = wallet.retry;
  useEffect(() => {
    window.addEventListener(GROUP_WALLET_CHANGED_EVENT, retryWallet);
    return () => window.removeEventListener(GROUP_WALLET_CHANGED_EVENT, retryWallet);
  }, [retryWallet]);
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (picking) panel.current?.querySelector<HTMLElement>("button, a[href]")?.focus({ preventScroll: true });
  }, [picking]);
  const pathname = usePathname() || "/";
  const query = useSearchParams()?.toString();
  const c = headerStatusCopy(locale);
  const w = walletCopy(locale);
  const loginHref = fanLoginHref(locale, `${pathname}${query ? `?${query}` : ""}`);
  // A stale authenticated session must never keep a previously read member balance/tier on screen.
  const expired = wallet.failure?.status === 401 || wallet.failure?.status === 403;
  if (!auth.authenticated) return <SelectedBiasChip locale={locale} />;
  if (expired || bias.status === "guest") return <Link className={styles.trigger} href={loginHref}>{w.login}</Link>;
  const current = bias.status === "ready" ? bias.selected : null;
  const grade = current ? fanStageLabel(locale, { tier: current.tier, subdivision: current.stage?.subdivision ?? Number(fanTierEntryKey(current.tier).split("-").at(-1)) }) : "";
  const hearts = current?.hearts;
  const points = wallet.data?.points;
  const onOpenChange = (next: boolean) => {
    setOpen(next);
    // Keep the current view during the exit animation; reset it before the next opening.
    if (next) setPicking(false);
  };
  const summary = [c.status, grade, hearts === undefined ? "" : `${c.hearts} ${hearts.toLocaleString(locale)}`, `${w.points} ${points?.toLocaleString(locale) ?? "—"}`].filter(Boolean).join(" · ");

  return <HeaderPopover.Root open={open} onOpenChange={onOpenChange}>
    <HeaderPopover.Trigger className={styles.trigger} data-header-status="" aria-label={summary}>
      {current && <><FanTierBadge tier={current.tier} stageKey={current.stage?.key} locale={locale} size={16} />{dot}</>}
      {hearts !== undefined && <><span className={styles.value}><img src="/images/economy/heart.svg" alt="" width={16} height={16} />{compactNumber(hearts, locale)}</span>{dot}</>}
      <span className={styles.value}><img src="/images/economy/point-coin.svg" alt="" width={16} height={16} />{points === undefined ? "—" : compactNumber(points, locale)}</span>
    </HeaderPopover.Trigger>
    <HeaderPopover.Content ref={panel} label={picking ? c.changeFavorite : c.status} data-header-status-panel="">
      {picking ? <>
        {bias.options.map(option => <HeaderPopover.Close key={option.slug} className={styles.row} aria-pressed={current?.slug === option.slug}
          onClick={() => bias.select(option.slug)}><span>{option.name}</span>{arrow}</HeaderPopover.Close>)}
        <HeaderPopover.Close asChild><Link className={styles.row} href={`/pages/groups?locale=${locale}`}><span>{c.findFavorite}</span>{arrow}</Link></HeaderPopover.Close>
      </> : <>
        {bias.status === "error" ? <FanAction variant="text" type="button" className={styles.row} onClick={bias.retry}><span>{c.changeFavorite} · {w.retry}</span>{arrow}</FanAction>
          : bias.options.length ? <FanAction variant="text" type="button" className={styles.row} onClick={() => setPicking(true)}><span>{c.changeFavorite}</span>{arrow}</FanAction>
          : <HeaderPopover.Close asChild><Link className={styles.row} href={(bias.unverified ? `/${encodeURIComponent(bias.unverified.slug)}?locale=${locale}` : `/pages/groups?locale=${locale}`) as Route}><span>{c.changeFavorite}</span>{arrow}</Link></HeaderPopover.Close>}
        <HeaderPopover.Close asChild><Link className={styles.row} href={`/guide/jjinfan?locale=${locale}`}><span>{c.tierGuide}</span>{arrow}</Link></HeaderPopover.Close>
        <HeaderPopover.Close asChild><Link className={styles.row} href={`/benefits?locale=${locale}`}><span>{groupBenefitsCopy(locale).title}</span>{arrow}</Link></HeaderPopover.Close>
        {wallet.error && points === undefined && <FanAction variant="text" type="button" className={styles.row} onClick={retryWallet}><span>{w.points} · {w.retry}</span>{arrow}</FanAction>}
      </>}
    </HeaderPopover.Content>
  </HeaderPopover.Root>;
}
