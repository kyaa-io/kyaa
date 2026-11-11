"use client";
import { RewardIcon, REWARD_ICON_SRC } from "@/components/fan-ui/reward-icon";
import Link from "next/link";
import type { Route } from "next";
import { useId, useState, type ReactNode } from "react";
import { BottomSheet, Dialog } from "@/components/ui/overlay/accessible-overlay";
import { useFanWide } from "@/components/fan-ui/fan-dialog";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanLockedValue } from "@/components/fan-ui/fan-locked-value";
import { FanLoginScene } from "@/components/fan-ui/fan-login-scene";
import { FanGauge, FanNumber } from "@/components/fan-ui/fan-number";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { dukjilText } from "@/features/dukjil/ui/dukjil-copy";
import { nextHeartLabel, STAMPS_PER_HEART } from "@/features/groups/ui/stan-lucky-cheer";
import type { AppLocale } from "@/i18n/locales";
import { GROUP_WALLET_POINT_COST } from "@/server/group-wallet/domain";
import { walletCopy } from "./copy";
import type { WalletCardState } from "./wallet-card";
import { StanExchange } from "./stan-exchange";
import { rewardedExchangeCopy } from "./rewarded-copy";
import { usePendingExchange } from "./use-pending-exchange";
import styles from "./stan-wallet.module.css";

/** 지갑과 헤더가 공유하는 노란 포인트·분홍 보상 세트. */
const WALLET_GLYPHS = { coin: REWARD_ICON_SRC.point, ticket: REWARD_ICON_SRC.ticket, heart: REWARD_ICON_SRC.heart, stamp: REWARD_ICON_SRC.stamp } as const;

export type StanSlot = "loading" | "locked" | "missing" | number;

function Value({ locale, slot, unit }: { locale: AppLocale; slot: StanSlot; unit?: ReactNode }) {
  if (slot === "loading") return <FanSkeleton width={48} height={18} />;
  if (slot === "locked") return <FanLockedValue locale={locale} />;
  if (slot === "missing") return <span>—</span>;
  return <FanNumber value={slot} countUp locale={locale} unit={unit} className={styles.number} />;
}

/** DS-D-DUO R2: four equal tiles; the existing ad/exchange transaction runs inside the sheet. */
export function StanWallet({ locale, state, stamps, hearts, links, entries, entriesRetry, className, favoritePicker }: { locale: AppLocale; state: WalletCardState; stamps: StanSlot; hearts: StanSlot; links: { hearts: string; claim?: string }; entries?: number | "loading" | "missing"; entriesRetry?: () => void; className?: string; favoritePicker?: ReactNode }) {
  const w = walletCopy(locale), s = (key: Parameters<typeof dukjilText>[1], values?: unknown[]) => dukjilText(locale, key, values);
  const [open, setOpen] = useState(false), titleId = useId(), wide = useFanWide(), Overlay = wide ? Dialog : BottomSheet;
  const pendingRequest = usePendingExchange();
  const pointCost = state.kind === "ready" ? state.pointCost : GROUP_WALLET_POINT_COST;
  const points: StanSlot = state.kind === "ready" ? state.points : state.kind === "guest" ? "locked" : state.kind === "loading" ? "loading" : "missing";
  const tickets = state.kind === "ready" ? state.tickets : points;
  const ready = state.kind === "ready", affordable = ready && state.points >= pointCost;
  const stampCount = typeof stamps === "number" ? stamps : 0, full = stampCount > 0 && stampCount % STAMPS_PER_HEART === 0;
  const claimable = full && Boolean(links.claim);
  const glyph = (name: keyof typeof WALLET_GLYPHS) => <RewardIcon kind={name === "coin" ? "point" : name} className={styles.glyph} data-glyph={name} size={32} />;
  const stampText = full ? claimable ? nextHeartLabel(locale, stampCount) : "" : nextHeartLabel(locale, stampCount);
  return <section className={[styles.wallet, className].filter(Boolean).join(" ")} id="wallet" aria-label={s("stanWalletFlows")} data-wallet-card="stan">
    <div className={styles.head}><FanHeading>{s("stanWalletFlows")}</FanHeading><Link className={styles.guide} href={`/guide/dukjil?locale=${locale}` as Route}>{s("stanGuide")} <span aria-hidden="true">›</span></Link></div>
    {state.kind === "guest" ? <FanLoginScene items={["coin", "ticket", "stamp", "heart"].map((name) => ({ src: WALLET_GLYPHS[name as keyof typeof WALLET_GLYPHS] }))} title={[w.points, w.tickets, s("stanFlowStamps"), s("stanFlowHearts")].join(" · ")} action={state.action} /> : <div className={styles.tiles}>
      <div className={styles.cell} data-cell="points">{glyph("coin")}<span className={styles.label}>{w.points}</span><span className={styles.value}><Value locale={locale} slot={points} unit="P" /></span>
        <div className={styles.under}><FanGauge size="sm" className={styles.gauge} value={ready ? Math.min(state.points, pointCost) : 0} max={pointCost} label={s("walletNextTicket", [pointCost])} />
          <FanAction variant="text" className={styles.tileLink} disabled={!ready || (!pendingRequest.pending && !affordable)} onClick={() => setOpen(true)}>{locale === "ko" ? "교환" : w.exchange} <span aria-hidden="true">›</span></FanAction></div>
      </div>
      <div className={styles.cell} data-cell="tickets">{glyph("ticket")}<span className={styles.label}>{w.tickets}</span><span className={styles.value}><Value locale={locale} slot={tickets} unit={locale === "ko" ? "장" : undefined} /></span>
        <div className={styles.under} data-entry-state={entries === undefined ? "idle" : typeof entries === "number" ? "ready" : entries} aria-busy={entries === "loading"}>{entries === "loading" ? <span aria-label={w.loading}><FanSkeleton width={96} height={18} /></span> : entries === "missing" ? <FanAction variant="text" className={styles.tileLink} ariaLabel={`${w.error} ${w.retry}`} onClick={entriesRetry}>{w.retry}</FanAction> : <Link className={styles.tileLink} href={`/my/raffles?locale=${locale}` as Route}>{entries === undefined ? s("luckyHistory") : s("luckyMyEntries", [entries.toLocaleString(locale)])} <span aria-hidden="true">›</span></Link>}</div>
      </div>
      {favoritePicker ? <div className={`${styles.cell} ${styles.favoritePicker}`} data-cell="favorite-picker">{favoritePicker}</div> : <><div className={styles.cell} data-cell="stamps">{glyph("stamp")}<span className={styles.label}>{s("stanFlowStamps")}</span><span className={styles.value}><Value locale={locale} slot={stamps} unit={`/${STAMPS_PER_HEART}`} /></span>
        <div className={styles.under}><FanGauge size="sm" className={styles.gauge} segments={STAMPS_PER_HEART} value={full ? STAMPS_PER_HEART : stampCount % STAMPS_PER_HEART} max={STAMPS_PER_HEART} label={s("stanFlowStamps")} />
          {typeof stamps === "number" && <Link className={claimable ? styles.tileLink : styles.stampLabel} href={(claimable ? links.claim! : `/passports?locale=${locale}`) as Route}>{stampText}{claimable && <> <span aria-hidden="true">›</span></>}</Link>}</div>
      </div>
      <div className={styles.cell} data-cell="hearts">{glyph("heart")}<span className={styles.label}>{s("stanFlowHearts")}</span><span className={styles.value}><Value locale={locale} slot={hearts} /></span></div></>}
    </div>}
    {state.kind === "failed" && state.retry ? <FanAction onClick={state.retry}>{w.retry}</FanAction> : null}
    <Overlay open={open && ready} onClose={() => setOpen(false)} labelledBy={titleId} backdropClassName={styles.backdrop} contentClassName={styles.sheet}>
      {!wide && <span className={styles.handle} aria-hidden="true" />}
      <div className={styles.sheetTitle}><FanHeading id={titleId}>{rewardedExchangeCopy(locale).action}</FanHeading></div><div className={styles.sheetBalance}><div className={styles.sheetLabel}>{w.points}</div><div className={styles.sheetValue}><Value locale={locale} slot={points} unit="P" /></div></div>
      {ready && <StanExchange locale={locale} points={state.points} pointCost={pointCost} pendingRequest={pendingRequest} onSuccess={() => setOpen(false)} />}
    </Overlay>
  </section>;
}
