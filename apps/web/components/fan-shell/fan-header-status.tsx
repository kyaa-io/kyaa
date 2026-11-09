"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import type { Route } from "next";
import { usePathname, useSearchParams } from "next/navigation";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { Heart } from "@/components/fan-ui/fan-icons";
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
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
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
  const close = (returnFocus = false) => {
    setOpen(false);
    setPicking(false);
    if (returnFocus) trigger.current?.focus({ preventScroll: true });
  };
  const summary = [c.status, grade, hearts === undefined ? "" : `${c.hearts} ${hearts.toLocaleString(locale)}`, `${w.points} ${points?.toLocaleString(locale) ?? "—"}`].filter(Boolean).join(" · ");

  return <>
    <span className={styles.container} data-header-status=""><FanAction type="button" variant="text" className={styles.trigger} ariaLabel={summary}
      aria-expanded={open} aria-controls={panelId}
      onClick={event => { trigger.current = event.currentTarget; if (open) close(); else setOpen(true); }}>
      {current && <><FanTierBadge tier={current.tier} stageKey={current.stage?.key} locale={locale} size={16} />{dot}</>}
      {hearts !== undefined && <><span className={styles.value}><FanIcon icon={Heart} size={16} />{compactNumber(hearts, locale)}</span>{dot}</>}
      <span className={styles.value}>P {points === undefined ? "—" : compactNumber(points, locale)}</span>
    </FanAction></span>
    {open && <StatusPanel id={panelId} label={picking ? c.changeFavorite : c.status} anchorRef={trigger} onClose={close} viewKey={picking}>
      {picking ? <>
        {bias.options.map(option => <FanAction variant="text" key={option.slug} type="button" className={styles.row} aria-pressed={current?.slug === option.slug}
          onClick={() => { bias.select(option.slug); close(true); }}><span>{option.name}</span>{arrow}</FanAction>)}
        <Link className={styles.row} href={`/pages/groups?locale=${locale}`} onClick={() => close()}><span>{c.findFavorite}</span>{arrow}</Link>
      </> : <>
        {bias.status === "error" ? <FanAction variant="text" type="button" className={styles.row} onClick={bias.retry}><span>{c.changeFavorite} · {w.retry}</span>{arrow}</FanAction>
          : bias.options.length ? <FanAction variant="text" type="button" className={styles.row} onClick={() => setPicking(true)}><span>{c.changeFavorite}</span>{arrow}</FanAction>
          : <Link className={styles.row} href={(bias.unverified ? `/${encodeURIComponent(bias.unverified.slug)}?locale=${locale}` : `/pages/groups?locale=${locale}`) as Route} onClick={() => close()}><span>{c.changeFavorite}</span>{arrow}</Link>}
        <Link className={styles.row} href={`/guide/jjinfan?locale=${locale}`} onClick={() => close()}><span>{c.tierGuide}</span>{arrow}</Link>
        <Link className={styles.row} href={`/benefits?locale=${locale}`} onClick={() => close()}><span>{groupBenefitsCopy(locale).title}</span>{arrow}</Link>
        {wallet.error && points === undefined && <FanAction variant="text" type="button" className={styles.row} onClick={retryWallet}><span>{w.points} · {w.retry}</span>{arrow}</FanAction>}
      </>}
    </StatusPanel>}
  </>;
}

/** Notification-panel pattern: fixed, measured against the trigger, with outside dismissal and focus return.
 * A portal avoids ancestor clipping. Tab can leave this non-modal panel; it is not a keyboard trap. */
function StatusPanel({ id, label, anchorRef, onClose, viewKey, children }: {
  id: string; label: string; anchorRef: RefObject<HTMLButtonElement | null>;
  onClose: (returnFocus?: boolean) => void; viewKey: boolean; children: React.ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ top: number; right: number } | null>(null);
  const closeRef = useRef(onClose);
  useLayoutEffect(() => { closeRef.current = onClose; });
  useLayoutEffect(() => {
    const measure = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      const height = panel.current?.getBoundingClientRect().height ?? 0;
      const width = panel.current?.getBoundingClientRect().width ?? 0;
      setPlace({ top: Math.max(16, Math.min(rect.bottom + 8, window.innerHeight - height - 16)), right: Math.max(16, Math.min(window.innerWidth - rect.right, window.innerWidth - width - 16)) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (panel.current) observer.observe(panel.current);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); };
  }, [anchorRef]);
  const placed = place !== null;
  useEffect(() => {
    if (placed) panel.current?.querySelector<HTMLElement>("button, a[href]")?.focus({ preventScroll: true });
  }, [placed, viewKey]);
  useEffect(() => {
    const outside = (event: Event) => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !anchorRef.current?.contains(target)) closeRef.current();
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeRef.current(true); }
      if (event.key !== "Tab") return;
      const items = panel.current?.querySelectorAll<HTMLElement>("button, a[href]");
      if (!items?.length) return;
      if ((event.shiftKey && document.activeElement === items[0]) || (!event.shiftKey && document.activeElement === items[items.length - 1])) {
        // Restore the logical header tab order across the portal. Forward Tab then proceeds to the next header control.
        if (event.shiftKey) event.preventDefault();
        closeRef.current(true);
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("focusin", outside); document.removeEventListener("keydown", keydown); };
  }, [anchorRef]);
  return createPortal(<div ref={panel} id={id} role="region" aria-label={label} className={styles.panel}
    style={place ?? { visibility: "hidden" }} data-header-status-panel="">{children}</div>, document.body);
}
