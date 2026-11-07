"use client";
import { ArrowRight } from "lucide-react";
import { useState, type ReactNode } from "react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanLockedValue } from "@/components/fan-ui/fan-locked-value";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { POINT_COIN_SRC } from "@/features/dukjil/ui/earn-badge";
import type { AppLocale } from "@/i18n/locales";
import { GROUP_WALLET_POINT_COST } from "@/server/group-wallet/domain";
import { ticketSingular, walletCopy, walletHelpCopy } from "./copy";
import { HelpHint } from "./help-hint";
import { rewardedExchangeCopy } from "./rewarded-copy";
import { WalletExchangeDialog } from "./wallet-screen";
import styles from "./wallet-card.module.css";

export type WalletCardBalances = { points: number; tickets: number; pointCost: number };
/** `missing`: the balance read failed; the slot shows a dash and the screen shows the failure elsewhere. */
type Slot = "loading" | "locked" | "missing" | number;

function Value({ locale, slot, unit, coin = false }: { locale: AppLocale; slot: Slot; unit?: string; coin?: boolean }) {
  if (slot === "loading") return <dd className={styles.value}><FanSkeleton width={72} height={32} /></dd>;
  if (slot === "locked") return <dd className={styles.value}><FanLockedValue locale={locale} /></dd>;
  if (slot === "missing") return <dd className={styles.value}>—</dd>;
  return <dd className={styles.value}>{coin && <img src={POINT_COIN_SRC} width={20} height={20} alt="" aria-hidden="true" />}{slot.toLocaleString(locale)}{unit && <span className={styles.unit}>{unit}</span>}</dd>;
}

/** Two balance cells: points with the coin, group tickets. */
export function WalletBalances({ locale, points, tickets }: { locale: AppLocale; points: Slot; tickets: Slot }) {
  const w = walletCopy(locale), h = walletHelpCopy(locale);
  return <dl className={styles.balances}>
    <div className={styles.balance} data-summary="points"><dt className={styles.label}><span>{w.points}</span><HelpHint label={h.label} text={h.points} /></dt><Value locale={locale} slot={points} unit="P" coin /></div>
    <div className={styles.balance}><dt className={styles.label}><img src="/images/economy/ticket.svg" alt="" width={20} height={20} /><span>{locale === "ko" ? "모임 응모권" : w.tickets}</span><HelpHint label={h.label} text={h.tickets} /></dt><Value locale={locale} slot={tickets} unit={locale === "ko" ? "장" : undefined} /></div>
  </dl>;
}

export function WalletRate({ locale, pointCost }: { locale: AppLocale; pointCost: number }) {
  const w = walletCopy(locale);
  return <div className={styles.rate}><span>{pointCost.toLocaleString(locale)} P</span><ArrowRight size={18} aria-hidden="true" /><span>{locale === "ko" ? "1장" : `1 ${ticketSingular[locale] ?? w.tickets}`}</span></div>;
}

/** Rate and the exchange action: enabled only when the points cover the rate. The exchange itself runs in WalletExchangeDialog. */
export function WalletExchange({ locale, pointCost, affordable }: { locale: AppLocale; pointCost: number; affordable: boolean }) {
  const [open, setOpen] = useState(false);
  return <div className={styles.exchange}><WalletRate locale={locale} pointCost={pointCost} /><FanAction variant="primary" fullWidth className={styles.action} disabled={!affordable} onClick={() => setOpen(true)}>{rewardedExchangeCopy(locale).action}</FanAction><WalletExchangeDialog locale={locale} open={open} onClose={() => setOpen(false)} /></div>;
}

export type WalletCardState =
  | { kind: "loading" }
  | { kind: "guest"; action: ReactNode }
  | { kind: "failed"; retry?: () => void }
  | ({ kind: "ready" } & WalletCardBalances);

/** The one wallet card of MY and 덕질: optional head, balances, rate, exchange. Below the balances it is the same on both. */
export function WalletCard({ locale, state, title, viewHref, viewLabel, framed = false, className, id }: { locale: AppLocale; state: WalletCardState; title: string; viewHref?: string; viewLabel?: string; framed?: boolean; className?: string; id?: string }) {
  const w = walletCopy(locale);
  const points: Slot = state.kind === "ready" ? state.points : state.kind === "guest" ? "locked" : state.kind === "loading" ? "loading" : "missing";
  const tickets: Slot = state.kind === "ready" ? state.tickets : points;
  return <section id={id} className={[styles.card, className].filter(Boolean).join(" ")} data-framed={framed ? "" : undefined} data-wallet-card aria-label={title}>
    {viewHref ? <header className={styles.head}><FanHeading as="h2">{title}</FanHeading><FanAction variant="text" trailingIcon={<ArrowRight />} href={viewHref}>{viewLabel}</FanAction></header> : null}
    <WalletBalances locale={locale} points={points} tickets={tickets} />
    {state.kind === "ready" ? <WalletExchange locale={locale} pointCost={state.pointCost} affordable={state.points >= state.pointCost} />
      : state.kind === "failed" ? (state.retry ? <div className={styles.error} role="alert"><p>{w.error}</p><FanAction onClick={state.retry}>{w.retry}</FanAction></div> : null)
      : <div className={styles.exchange}><WalletRate locale={locale} pointCost={GROUP_WALLET_POINT_COST} />{state.kind === "guest" ? state.action : <FanSkeleton shape="block" width="100%" height={48} />}</div>}
  </section>;
}
