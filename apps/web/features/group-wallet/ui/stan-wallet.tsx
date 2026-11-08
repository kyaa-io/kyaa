"use client";
import { ChevronRight, Heart } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { useState, type ReactNode } from "react";
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
import { rewardedExchangeCopy } from "./rewarded-copy";
import type { WalletCardState } from "./wallet-card";
import { WalletExchangeDialog } from "./wallet-screen";
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

/** 덕질 wallet (feedback F2): the two assets (points, hearts) as big numbers, under each the step it becomes next
 *  (tickets with the points still needed, stamps with the slots left to the next heart), and the one wallet action.
 *  390: two columns with the action row below; 768+: a third 288px column holds the action. The rules live on the guide page (안내 ›), not in help buttons.
 *  Stamps are the stamped slots of the passport page being filled (n/9, the same number as MY); nine fill a page and a page is a heart. Numbers count up only when they change. */
export function StanWallet({ locale, state, stamps, hearts, links, className }: { locale: AppLocale; state: WalletCardState; stamps: StanSlot; hearts: StanSlot; links: { hearts: string }; className?: string }) {
  const w = walletCopy(locale), s = (key: Parameters<typeof dukjilText>[1], values?: unknown[]) => dukjilText(locale, key, values);
  const [open, setOpen] = useState(false);
  const pointCost = state.kind === "ready" ? state.pointCost : GROUP_WALLET_POINT_COST;
  const points: StanSlot = state.kind === "ready" ? state.points : state.kind === "guest" ? "locked" : state.kind === "loading" ? "loading" : "missing";
  const tickets: StanSlot = state.kind === "ready" ? state.tickets : points;
  const ready = state.kind === "ready", affordable = ready && state.points >= pointCost;
  const toNext = ready ? pointCost - (state.points % pointCost) : pointCost;
  const ticketText = affordable ? <strong className={styles.ready}>{s("walletExchangeReady")}</strong> : s("walletNextTicket", [toNext.toLocaleString(locale)]);
  const stampCount = typeof stamps === "number" ? stamps : 0, pageFull = stampCount > 0 && stampCount % STAMPS_PER_HEART === 0;
  const stampText = pageFull ? <strong className={styles.ready}>{nextHeartLabel(locale, stampCount)}</strong> : nextHeartLabel(locale, stampCount);
  const coin = <img src={POINT_COIN_SRC} width={20} height={20} alt="" />;
  const gaugeSlot = (slot: StanSlot, gauge: ReactNode) => slot === "loading" ? <FanSkeleton shape="block" width="100%" height={20} /> : slot === "missing" ? null : gauge;
  return <section className={[styles.wallet, className].filter(Boolean).join(" ")} aria-label={s("stanWalletFlows")} data-wallet-card="stan">
    <Cell cell="points" href="#stan-history">
      <span className={styles.label}>{w.points}</span>
      <span className={styles.value}><Value locale={locale} slot={points} size="xl" unit="P" icon={coin} /></span>
    </Cell>
    <Cell cell="hearts" href={links.hearts}>
      <span className={styles.label}>{s("stanFlowHearts")}</span>
      <span className={styles.value}><Value locale={locale} slot={hearts} size="xl" icon={<Heart size={20} strokeWidth={1.75} className={styles.heart} />} /></span>
    </Cell>
    <Cell cell="tickets" href={`/my/raffles?locale=${locale}`}>
      <span className={styles.step}><span>{w.tickets}</span><Value locale={locale} slot={tickets} size="md" unit={locale === "ko" ? "장" : undefined} /><ChevronRight className={styles.next} size={16} aria-hidden="true" /></span>
      <span className={styles.progress}>{gaugeSlot(tickets, <FanGauge size="sm" className={styles.gauge} value={ready ? (affordable ? pointCost : state.points % pointCost) : 0} max={pointCost} label={s("walletNextTicket", [toNext.toLocaleString(locale)])} valueText={ticketText} />)}</span>
    </Cell>
    <Cell cell="stamps" href={`/passports?locale=${locale}`}>
      <span className={styles.step}><span>{s("stanFlowStamps")}</span><Value locale={locale} slot={stamps} size="md" unit={`/${STAMPS_PER_HEART}`} /><ChevronRight className={styles.next} size={16} aria-hidden="true" /></span>
      <span className={styles.progress}>{gaugeSlot(stamps, <FanGauge size="sm" className={styles.gauge} segments={STAMPS_PER_HEART} value={pageFull ? STAMPS_PER_HEART : stampCount % STAMPS_PER_HEART} max={STAMPS_PER_HEART} label={nextHeartLabel(locale, stampCount)} valueText={stampText} />)}</span>
    </Cell>
    <Link className={styles.guide} href={`/guide/dukjil?locale=${locale}` as Route}>{s("stanGuide")}<ChevronRight size={16} aria-hidden="true" /></Link>
    <div className={styles.action}>
      {state.kind === "guest" ? state.action
        : state.kind === "loading" ? <FanSkeleton shape="block" width="100%" height={44} />
        : state.kind === "failed" ? (state.retry ? <FanAction fullWidth onClick={state.retry}>{w.retry}</FanAction> : null)
        : <><FanAction variant="secondary" fullWidth disabled={!affordable} onClick={() => setOpen(true)}>{rewardedExchangeCopy(locale).action}</FanAction><WalletExchangeDialog locale={locale} open={open} onClose={() => setOpen(false)} /></>}
    </div>
  </section>;
}
