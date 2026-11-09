"use client";
import { ChevronRight, Heart } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanLockedValue } from "@/components/fan-ui/fan-locked-value";
import { FanGauge, FanNumber } from "@/components/fan-ui/fan-number";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { dukjilText } from "@/features/dukjil/ui/dukjil-copy";
import { POINT_COIN_SRC } from "@/features/dukjil/ui/earn-badge";
import { nextHeartLabel, STAMPS_PER_HEART } from "@/features/groups/ui/stan-lucky-cheer";
import type { AppLocale } from "@/i18n/locales";
import { GROUP_WALLET_POINT_COST } from "@/server/group-wallet/domain";
import { walletCopy } from "./copy";
import type { WalletCardState } from "./wallet-card";
import { StanExchange, StanExchangeLoading } from "./stan-exchange";
import styles from "./stan-wallet.module.css";

/** A number slot: loading holds the size of the number, locked is the signed-out lock, missing draws nothing (the failure is told elsewhere). */
export type StanSlot = "loading" | "locked" | "missing" | number;

/** One linked cell; the whole cell is the link (hash links stay plain anchors so the page scrolls). */
function Cell({ cell, href, children }: { cell: string; href: string; children: ReactNode }) {
  return href.startsWith("#")
    ? <a className={styles.cell} data-cell={cell} href={href}>{children}</a>
    : <Link className={styles.cell} data-cell={cell} href={href as Route}>{children}</Link>;
}

function Value({ locale, slot, size, unit, icon }: { locale: AppLocale; slot: StanSlot; size: "xl" | "md"; unit?: ReactNode; icon?: ReactNode }) {
  if (slot === "loading") return <FanSkeleton width={size === "xl" ? 96 : 32} height={size === "xl" ? 32 : 20} />;
  if (slot === "locked") return <FanLockedValue locale={locale} />;
  if (slot === "missing") return null;
  // The next-step cells read as one word in Korean ("2장", "4/9"): number and unit sit together there.
  return <FanNumber value={slot} size={size} countUp locale={locale} unit={unit} icon={icon} className={size === "md" ? styles.stepNumber : undefined} />;
}

/** 덕질 wallet (감독 2026-11-09 20:18 덕질 시안 + B13): two columns read the same way, top to bottom.
 *  Left: points (the one big number) → the gauge to the next ticket → tickets, with the one action row ([− N +] and the exchange, B13) in the same column.
 *  Right: stamps n/9 → the nine-slot gauge → hearts (a full page becomes a heart when the fan presses 받기 on the mission book). No third column; 안내 › sits at the card's top end.
 *  Stamps are the stamped slots of the passport page being filled (n/9, the same number as MY). Numbers count up only when they change. */
export function StanWallet({ locale, state, stamps, hearts, links, className }: { locale: AppLocale; state: WalletCardState; stamps: StanSlot; hearts: StanSlot; links: { hearts: string; claim?: string }; className?: string }) {
  const w = walletCopy(locale), s = (key: Parameters<typeof dukjilText>[1], values?: unknown[]) => dukjilText(locale, key, values);
  const pointCost = state.kind === "ready" ? state.pointCost : GROUP_WALLET_POINT_COST;
  const points: StanSlot = state.kind === "ready" ? state.points : state.kind === "guest" ? "locked" : state.kind === "loading" ? "loading" : "missing";
  const tickets: StanSlot = state.kind === "ready" ? state.tickets : points;
  const ready = state.kind === "ready", affordable = ready && state.points >= pointCost;
  const toNext = ready ? pointCost - (state.points % pointCost) : pointCost;
  const ticketText = affordable ? <strong className={styles.ready}>{s("walletExchangeReady")}</strong> : s("walletNextTicket", [toNext.toLocaleString(locale)]);
  // 하트 받기 › only when a page can be claimed (the screen passes links.claim then); a full page that cannot be claimed says nothing more.
  const stampCount = typeof stamps === "number" ? stamps : 0, full = stampCount > 0 && stampCount % STAMPS_PER_HEART === 0, pageFull = full && Boolean(links.claim);
  // 사용자 결정 B: a full page is claimed on the mission book; the cell says 하트 받기 › and goes there.
  const stampText = pageFull ? <strong className={styles.ready}>{nextHeartLabel(locale, stampCount)}<ChevronRight size={16} aria-hidden="true" /></strong> : full ? "" : nextHeartLabel(locale, stampCount);
  const coin = <img src={POINT_COIN_SRC} width={20} height={20} alt="" />;
  const gaugeSlot = (slot: StanSlot, gauge: ReactNode) => slot === "loading" ? <FanSkeleton shape="block" width="100%" height={20} /> : slot === "missing" ? null : gauge;
  return <section className={[styles.wallet, className].filter(Boolean).join(" ")} id="wallet" aria-label={s("stanWalletFlows")} data-wallet-card="stan">
    <Cell cell="points" href="#stan-history">
      <span className={styles.label}>{w.points}</span>
      <span className={styles.value}><Value locale={locale} slot={points} size="xl" unit="P" icon={coin} /></span>
      <span className={styles.progress}>{gaugeSlot(tickets, <FanGauge size="sm" className={styles.gauge} value={ready ? (affordable ? pointCost : state.points % pointCost) : 0} max={pointCost} label={s("walletNextTicket", [toNext.toLocaleString(locale)])} valueText={ticketText} />)}</span>
    </Cell>
    <Cell cell="stamps" href={pageFull && links.claim ? links.claim : `/passports?locale=${locale}`}>
      <span className={styles.label}>{s("stanFlowStamps")}</span>
      <span className={styles.value}><Value locale={locale} slot={stamps} size="md" unit={`/${STAMPS_PER_HEART}`} /></span>
      <span className={styles.progress}>{gaugeSlot(stamps, <FanGauge size="sm" className={styles.gauge} segments={STAMPS_PER_HEART} value={full ? STAMPS_PER_HEART : stampCount % STAMPS_PER_HEART} max={STAMPS_PER_HEART} label={full && !pageFull ? s("stanFlowStamps") : nextHeartLabel(locale, stampCount)} valueText={stampText} />)}</span>
    </Cell>
    <Cell cell="tickets" href={`/my/raffles?locale=${locale}`}>
      <span className={styles.step}><span>{w.tickets}</span><Value locale={locale} slot={tickets} size="md" unit={locale === "ko" ? "장" : undefined} /><ChevronRight className={styles.next} size={16} aria-hidden="true" /></span>
    </Cell>
    <Cell cell="hearts" href={links.hearts}>
      <span className={styles.step}><span>{s("stanFlowHearts")}</span><Value locale={locale} slot={hearts} size="md" icon={<Heart size={16} strokeWidth={1.75} className={styles.heart} />} /><ChevronRight className={styles.next} size={16} aria-hidden="true" /></span>
    </Cell>
    <Link className={styles.guide} href={`/guide/dukjil?locale=${locale}` as Route}>{s("stanGuide")}<span aria-hidden="true">›</span></Link>
    <div className={styles.action}>
      {state.kind === "guest" ? state.action
        : state.kind === "loading" ? <StanExchangeLoading locale={locale} />
        : state.kind === "failed" ? (state.retry ? <FanAction fullWidth onClick={state.retry}>{w.retry}</FanAction> : null)
        : <StanExchange locale={locale} points={state.points} pointCost={pointCost} />}
    </div>
  </section>;
}
