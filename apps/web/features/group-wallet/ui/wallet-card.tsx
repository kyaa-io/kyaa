"use client";
import { RewardIcon } from "@/components/fan-ui/reward-icon";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanLockedValue } from "@/components/fan-ui/fan-locked-value";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { dukjilText } from "@/features/dukjil/ui/dukjil-copy";
import { POINT_COIN_SRC } from "@/features/dukjil/ui/earn-badge";
import type { AppLocale } from "@/i18n/locales";
import { ticketSingular, walletCopy, walletHelpCopy } from "./copy";
import { HelpHint } from "./help-hint";
import styles from "./wallet-card.module.css";

export type WalletCardBalances = { points: number; tickets: number; pointCost: number };
/** `missing`: the balance read failed; the slot shows a dash and the screen shows the failure elsewhere. */
export type Slot = "loading" | "locked" | "missing" | number;

/** From 10,000 the MY card shows the short form (1.2만, 12K; exact numbers stay in 덕질) so three numbers fit one line at 390. */
const COMPACT_FROM = 10_000;
function Value({ locale, slot, unit, coin = false, compact = false, className = styles.value }: { locale: AppLocale; slot: Slot; unit?: string; coin?: boolean; compact?: boolean; className?: string }) {
  if (slot === "loading") return <dd className={className}><FanSkeleton width={72} height={32} /></dd>;
  if (slot === "locked") return <dd className={className}><FanLockedValue locale={locale} /></dd>;
  if (slot === "missing") return <dd className={className}>—</dd>;
  return <dd className={className}>{coin && <img src={POINT_COIN_SRC} width={20} height={20} alt="" aria-hidden="true" />}{compact && slot >= COMPACT_FROM ? new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 0 }).format(slot) : slot.toLocaleString(locale)}{unit && <span className={styles.unit}>{unit}</span>}</dd>;
}

/** Two balance cells: points with the coin, group tickets. */
export function WalletBalances({ locale, points, tickets }: { locale: AppLocale; points: Slot; tickets: Slot }) {
  const w = walletCopy(locale), h = walletHelpCopy(locale);
  return <dl className={styles.balances}>
    <div className={styles.balance} data-summary="points"><dt className={styles.label}><span>{w.points}</span><HelpHint label={h.label} text={h.points} /></dt><Value locale={locale} slot={points} unit="P" coin /></div>
    <div className={styles.balance}><dt className={styles.label}><RewardIcon kind="ticket" alt="" width={20} height={20} /><span>{locale === "ko" ? "응모권" : w.tickets}</span><HelpHint label={h.label} text={h.tickets} /></dt><Value locale={locale} slot={tickets} unit={locale === "ko" ? "장" : undefined} /></div>
  </dl>;
}

export function WalletRate({ locale, pointCost }: { locale: AppLocale; pointCost: number }) {
  const w = walletCopy(locale);
  return <div className={styles.rate}><span>{pointCost.toLocaleString(locale)} P</span><ArrowRight size={18} aria-hidden="true" /><span>{locale === "ko" ? "1장" : `1 ${ticketSingular[locale] ?? w.tickets}`}</span></div>;
}

export type WalletCardState =
  | { kind: "loading" }
  | { kind: "guest"; action: ReactNode }
  | { kind: "failed"; retry?: () => void }
  | ({ kind: "ready" } & WalletCardBalances);

/** MY 내 지갑 (B13): points, tickets and hearts as three numbers in one fixed-height card; the whole card is one link (signed in: the 덕질 wallet, signed out: login).
 *  No exchange here: exchanging starts only in the 덕질 wallet card. Loading, signed-out, zero and failed balances keep the same 132px. */
export function WalletCard({ locale, state, hearts, title, href, className }: { locale: AppLocale; state: WalletCardState; hearts: Slot; title: string; href: string; className?: string }) {
  const w = walletCopy(locale);
  const points: Slot = state.kind === "ready" ? state.points : state.kind === "guest" ? "locked" : state.kind === "loading" ? "loading" : "missing";
  const tickets: Slot = state.kind === "ready" ? state.tickets : points;
  const cells: [string, Slot, string | undefined][] = [[w.points, points, "P"], [w.tickets, tickets, locale === "ko" ? "장" : undefined], [dukjilText(locale, "stanFlowHearts"), state.kind === "ready" ? hearts : points, undefined]];
  return <Link href={href as Route} className={[styles.my, className].filter(Boolean).join(" ")} data-wallet-card="my" aria-label={title}>
    <span className={styles.myHead}><FanHeading as="h2">{title}</FanHeading><span aria-hidden="true">›</span></span>
    <dl className={styles.myBalances}>{cells.map(([label, slot, unit]) => <div key={label} className={styles.myCell}><dt className={styles.label}>{label}</dt><Value locale={locale} slot={slot} unit={unit} compact className={styles.myValue} /></div>)}</dl>
  </Link>;
}
