"use client";
import { ChevronRight, Heart } from "@/components/fan-ui/stan-icons";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanLockedValue } from "@/components/fan-ui/fan-locked-value";
import { FanNumber } from "@/components/fan-ui/fan-number";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { dukjilText } from "@/features/dukjil/ui/dukjil-copy";
import { STAMPS_PER_HEART } from "@/features/groups/ui/stan-lucky-cheer";
import type { AppLocale } from "@/i18n/locales";
import { GROUP_WALLET_POINT_COST } from "@/server/group-wallet/domain";
import { walletCopy } from "./copy";
import { rewardedExchangeCopy } from "./rewarded-copy";
import type { WalletCardState } from "./wallet-card";
import styles from "./stan-wallet.module.css";

/** A number slot: loading holds the size of the number, locked is the signed-out lock, missing draws nothing (the failure is told elsewhere). */
export type StanSlot = "loading" | "locked" | "missing" | number;

function Slot({ locale, slot, children }: { locale: AppLocale; slot: StanSlot; children: (value: number) => ReactNode }) {
  if (slot === "loading") return <FanSkeleton width={40} height={20} />;
  if (slot === "locked") return <FanLockedValue locale={locale} />;
  if (slot === "missing") return null;
  return <>{children(slot)}</>;
}

/** One label-value row (56): the asset name over its rate (the API's rate where there is one), the value on the right; the whole row is the link. */
function Row({ row, label, rate, href, children }: { row: string; label: string; rate: string; href: string; children: ReactNode }) {
  return <Link className={styles.row} href={href as Route} data-row="label-value" data-wallet-row={row}>
    <span className={styles.rowCopy}><span className={styles.rowLabel}>{label}</span><span className={styles.rowRate} data-meta="">{rate}</span></span>
    <span className={styles.rowValue} data-row-end="">{children}</span>
    <FanIcon icon={ChevronRight} className={styles.next} size={16} />
  </Link>;
}

/** 덕질 잔액 카드 (plan-ux r5.1 3.2, G2): the label `포인트 적립·사용 ›` (to the history tab), the balance as the screen's one hero number,
 *  the one wallet action `교환` and three label-value rows that say what the points become (응모권 · 스탬프 · 하트) with their rates.
 *  `교환` is the screen's primary unless a lucky draw is open for entries (then `응모하기` is, plan ③); under the rate it is disabled (plan ④). */
export function StanWallet({ locale, state, stamps, hearts, links, exchangeSecondary = false, onExchange, className }: {
  locale: AppLocale; state: WalletCardState; stamps: StanSlot; hearts: StanSlot;
  links: { hearts: string; tickets: string; history: string; onHistory?: () => void };
  exchangeSecondary?: boolean; onExchange: () => void; className?: string;
}) {
  const w = walletCopy(locale), s = (key: Parameters<typeof dukjilText>[1], values?: unknown[]) => dukjilText(locale, key, values);
  const pointCost = state.kind === "ready" ? state.pointCost : GROUP_WALLET_POINT_COST;
  const points: StanSlot = state.kind === "ready" ? state.points : state.kind === "guest" ? "locked" : state.kind === "loading" ? "loading" : "missing";
  const tickets: StanSlot = state.kind === "ready" ? state.tickets : points;
  const affordable = state.kind === "ready" && state.points >= pointCost;
  const heart = <FanIcon icon={Heart} size={16} className={styles.heart} />;
  const action = state.kind === "guest" ? state.action
    : state.kind === "loading" ? <FanSkeleton shape="block" width={96} height={44} />
    : state.kind === "failed" ? (state.retry ? <FanAction variant="text" onClick={state.retry}>{w.retry}</FanAction> : null)
    : <FanAction variant={exchangeSecondary ? "secondary" : "primary"} className={styles.exchange} disabled={!affordable} onClick={onExchange}>{rewardedExchangeCopy(locale).action}</FanAction>;
  return <section className={[styles.wallet, className].filter(Boolean).join(" ")} aria-label={s("stanWalletFlows")} data-wallet-card="stan">
    <div className={styles.top}>
      <div className={styles.balance}>
        <p className={styles.label}><span>{w.points}</span><Link className={styles.history} href={links.history as Route} scroll={false} onClick={links.onHistory} data-balance-history="">{s("walletPointsHistory")}<FanIcon icon={ChevronRight} size={16} /></Link></p>
        <div className={styles.hero} data-metric="asset" data-metric-id="wallet-points">
          {points === "loading" ? <FanSkeleton width={160} height={44} /> : points === "locked" ? <FanLockedValue locale={locale} /> : points === "missing" ? null
            : <FanNumber value={points} size="hero" countUp locale={locale} unit="P" />}
        </div>
      </div>
      <div className={styles.action} data-exchange={state.kind === "ready" ? (exchangeSecondary ? "secondary" : "primary") : undefined}>{action}</div>
    </div>
    <div className={styles.rows}>
      <Row row="tickets" label={w.tickets} rate={s("walletRateTickets", [pointCost.toLocaleString(locale)])} href={links.tickets}>
        <span data-metric="asset" data-metric-id="wallet-tickets"><Slot locale={locale} slot={tickets}>{value => s("walletTicketsValue", [value.toLocaleString(locale)])}</Slot></span>
      </Row>
      <Row row="stamps" label={s("stanFlowStamps")} rate={s("walletRateStamps", [STAMPS_PER_HEART])} href={`/passports?locale=${locale}`}>
        <Slot locale={locale} slot={stamps}>{value => `${value.toLocaleString(locale)}/${STAMPS_PER_HEART}`}</Slot>
      </Row>
      <Row row="hearts" label={s("stanFlowHearts")} rate={s("walletRateHearts")} href={links.hearts}>
        <Slot locale={locale} slot={hearts}>{value => <span className={styles.heartValue}>{heart}{value.toLocaleString(locale)}</span>}</Slot>
      </Row>
    </div>
  </section>;
}
