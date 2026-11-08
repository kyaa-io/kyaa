"use client";
import { ChevronRight, Heart } from "@/components/fan-ui/stan-icons";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanLockedValue } from "@/components/fan-ui/fan-locked-value";
import { FanGauge, FanNumber } from "@/components/fan-ui/fan-number";
import { FanHeading } from "@/components/fan-ui/fan-heading";
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

/** One progress row (56): what fills the card's big number — name and amount on the left, the rate on the right, the 2px bar under them. */
function Progress({ row, label, value, rate, gauge, href }: { row: string; label: string; value: ReactNode; rate: string; gauge: ReactNode; href?: string }) {
  const body = <>
    <span className={styles.progressLine}><span className={styles.progressLabel}>{label} <span className={styles.progressValue} data-row-end="">{value}</span></span><span className={styles.rate} data-meta="">{rate}</span></span>
    <span className={styles.progressBar}>{gauge}</span>
  </>;
  return href ? <Link className={styles.progress} href={href as Route} data-row="label-value" data-wallet-row={row}>{body}</Link>
    : <div className={styles.progress} data-row="label-value" data-wallet-row={row}>{body}</div>;
}

/** 덕질 지갑 쌍 (브리프 규칙 25, 팀 피드백 H4): what collects into what, side by side.
 *  Left: 응모권 as the big number, under it 포인트 N P with `100P = 1장` and its bar (points become tickets), and the one wallet action `교환`
 *  (ad, then exchange — the existing dialog). Right: 하트 as the big number, under it 스탬프 N/9 with `9칸 = 하트 1` (stamps become hearts).
 *  The head carries the one guide link `안내 ›`; `적립·사용 ›` (the history tab) sits by the points. `교환` is the screen's primary unless a
 *  lucky draw is open (then `응모하기` is, plan ③); under the rate it is disabled (plan ④). Guests see the same pair locked and the login. */
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
  const heart = <FanIcon icon={Heart} size={24} className={styles.heart} filled />;
  const hero = (slot: StanSlot, id: string, render: (value: number) => ReactNode) => <div className={styles.hero} data-metric="asset" data-metric-id={id}>
    {slot === "loading" ? <FanSkeleton width={120} height={44} /> : slot === "locked" ? <FanLockedValue locale={locale} /> : slot === "missing" ? null : render(slot)}
  </div>;
  const action = state.kind === "guest" ? state.action
    : state.kind === "loading" ? <FanSkeleton shape="block" width={96} height={44} />
    : state.kind === "failed" ? (state.retry ? <FanAction variant="text" onClick={state.retry}>{w.retry}</FanAction> : null)
    : <FanAction variant={exchangeSecondary ? "secondary" : "primary"} className={styles.exchange} disabled={!affordable} onClick={onExchange}>{rewardedExchangeCopy(locale).action}</FanAction>;
  const pointsGauge = typeof points === "number" ? <FanGauge size="line" value={affordable ? pointCost : points % pointCost} max={pointCost} label={s("walletRateTickets", [pointCost.toLocaleString(locale)])} />
    : points === "loading" ? <FanSkeleton shape="block" width="100%" height={2} /> : null;
  const stampsGauge = typeof stamps === "number" ? <FanGauge size="line" segments={STAMPS_PER_HEART} value={Math.min(stamps, STAMPS_PER_HEART)} max={STAMPS_PER_HEART} label={s("walletRateStamps", [STAMPS_PER_HEART])} />
    : stamps === "loading" ? <FanSkeleton shape="block" width="100%" height={2} /> : null;
  return <section className={[styles.wallet, className].filter(Boolean).join(" ")} aria-labelledby="stan-wallet-title" data-wallet-card="stan">
    <div className={styles.head}>
      <FanHeading id="stan-wallet-title">{s("stanWalletFlows")}</FanHeading>
      <Link className={styles.guide} href={`/guide/dukjil?locale=${locale}` as Route}>{s("stanGuide")}<FanIcon icon={ChevronRight} size={16} /></Link>
    </div>
    <div className={styles.pair}>
      <div className={styles.card} data-wallet-cell="tickets">
        <div className={styles.cardTop}>
          <div className={styles.balance}>
            <Link className={styles.label} href={links.tickets as Route}>{w.tickets}<FanIcon icon={ChevronRight} size={16} /></Link>
            {hero(tickets, "wallet-tickets", value => <FanNumber value={value} size="hero" countUp locale={locale} unit={locale === "ko" ? "장" : undefined} />)}
          </div>
          <div className={styles.action} data-exchange={state.kind === "ready" ? (exchangeSecondary ? "secondary" : "primary") : undefined}>{action}</div>
        </div>
        <Progress row="points" label={w.points} rate={s("walletRateTickets", [pointCost.toLocaleString(locale)])} gauge={pointsGauge}
          value={<Slot locale={locale} slot={points}>{value => <span data-metric="asset" data-metric-id="wallet-points">{value.toLocaleString(locale)} P</span>}</Slot>} />
        <Link className={styles.history} href={links.history as Route} scroll={false} onClick={links.onHistory} data-balance-history="">{s("walletPointsHistory")}<FanIcon icon={ChevronRight} size={16} /></Link>
      </div>
      <div className={styles.card} data-wallet-cell="hearts">
        <div className={styles.cardTop}>
          <div className={styles.balance}>
            <Link className={styles.label} href={links.hearts as Route}>{s("stanFlowHearts")}<FanIcon icon={ChevronRight} size={16} /></Link>
            {hero(hearts, "wallet-hearts", value => <FanNumber value={value} size="hero" countUp locale={locale} icon={heart} />)}
          </div>
        </div>
        <Progress row="stamps" label={s("stanFlowStamps")} rate={s("walletRateStamps", [STAMPS_PER_HEART])} gauge={stampsGauge} href={`/passports?locale=${locale}`}
          value={<Slot locale={locale} slot={stamps}>{value => `${value.toLocaleString(locale)}/${STAMPS_PER_HEART}`}</Slot>} />
      </div>
    </div>
  </section>;
}
