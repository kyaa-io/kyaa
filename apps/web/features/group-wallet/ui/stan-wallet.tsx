"use client";
import Link from "next/link";
import type { Route } from "next";
import { useId, useState, useSyncExternalStore, type ReactNode } from "react";
import { BottomSheet, Dialog } from "@/components/ui/overlay/accessible-overlay";
import { useFanWide } from "@/components/fan-ui/fan-dialog";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanLockedValue } from "@/components/fan-ui/fan-locked-value";
import { FanLoginScene } from "@/components/fan-ui/fan-login-scene";
import { FanGauge, FanNumber } from "@/components/fan-ui/fan-number";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { dukjilText } from "@/features/dukjil/ui/dukjil-copy";
import { STAMPS_PER_HEART } from "@/features/groups/ui/stan-lucky-cheer";
import type { AppLocale } from "@/i18n/locales";
import { GROUP_WALLET_POINT_COST } from "@/server/group-wallet/domain";
import { walletCopy } from "./copy";
import type { WalletCardState } from "./wallet-card";
import { rewardedAdUnit } from "./google-rewarded-ad";
import { StanExchange } from "./stan-exchange";
import { rewardedExchangeCopy } from "./rewarded-copy";
import { usePendingExchange } from "./use-pending-exchange";
import styles from "./stan-wallet.module.css";

/** 결과 두 칸의 애셋: 헤더와 패스포트에 이미 쓰는 응모권·하트. */
const WALLET_GLYPHS = { ticket: "/images/economy/ticket.svg", heart: "/images/economy/heart.svg" } as const;

export type StanSlot = "loading" | "locked" | "missing" | number;

function Value({ locale, slot, unit }: { locale: AppLocale; slot: StanSlot; unit?: ReactNode }) {
  if (slot === "loading") return <FanSkeleton width={48} height={28} />;
  if (slot === "locked") return <FanLockedValue locale={locale} />;
  if (slot === "missing") return <span>—</span>;
  return <FanNumber value={slot} countUp locale={locale} unit={unit} className={styles.number} />;
}

/** The ad unit comes from a meta tag in the browser; the server render never has it, so the buttons start disabled. */
const noSubscribe = () => () => {};
function useRewardedAdReady() {
  return useSyncExternalStore(noSubscribe, () => Boolean(rewardedAdUnit()), () => false);
}

/** 덕질 wallet (대표 11/11 10:37, 중간 버전 4cf1fee7b 구성): points gather into tickets the way stamps gather into hearts.
 *  Two columns read the same way — the result on top (응모권 N장 | 하트 N), the material under it (포인트 N/100P bar | 스탬프 N/9 slots),
 *  and each column's own button (교환 | 받기); both run behind the rewarded ad, so while no ad unit is set both are disabled and read 준비 중.
 *  1024+: a third column holds 안내 ›; below that the link sits in the heading row. */
export function StanWallet({ locale, state, stamps, hearts, links, className, favoritePicker }: { locale: AppLocale; state: WalletCardState; stamps: StanSlot; hearts: StanSlot; links: { hearts: string; claim?: string }; className?: string; favoritePicker?: ReactNode }) {
  const w = walletCopy(locale), s = (key: Parameters<typeof dukjilText>[1], values?: unknown[]) => dukjilText(locale, key, values);
  const [open, setOpen] = useState(false), titleId = useId(), wide = useFanWide(), Overlay = wide ? Dialog : BottomSheet;
  const pendingRequest = usePendingExchange();
  const adReady = useRewardedAdReady();
  const pointCost = state.kind === "ready" ? state.pointCost : GROUP_WALLET_POINT_COST;
  const points: StanSlot = state.kind === "ready" ? state.points : state.kind === "guest" ? "locked" : state.kind === "loading" ? "loading" : "missing";
  const tickets = state.kind === "ready" ? state.tickets : points;
  const ready = state.kind === "ready", affordable = ready && state.points >= pointCost;
  const stampCount = typeof stamps === "number" ? stamps : 0, full = stampCount > 0 && stampCount % STAMPS_PER_HEART === 0;
  const pageStamps = full ? STAMPS_PER_HEART : stampCount % STAMPS_PER_HEART;
  const claimable = full && Boolean(links.claim) && adReady;
  const glyph = (name: keyof typeof WALLET_GLYPHS) => <img className={styles.glyph} data-glyph={name} src={WALLET_GLYPHS[name]} width={32} height={32} alt="" />;
  const guide = (where: "head" | "column") => <Link className={styles.guide} data-guide={where} href={`/guide/dukjil?locale=${locale}` as Route}>{s("stanGuide")} <span aria-hidden="true">›</span></Link>;
  const material = (label: string, slot: StanSlot, text: ReactNode) => <span className={styles.step}><span>{label}</span>{slot === "loading" ? <FanSkeleton width={56} height={20} /> : <strong>{text}</strong>}</span>;
  return <section className={[styles.wallet, className].filter(Boolean).join(" ")} id="wallet" aria-label={s("stanWalletFlows")} data-wallet-card="stan">
    <div className={styles.head}><FanHeading>{s("stanWalletFlows")}</FanHeading>{guide("head")}</div>
    {state.kind === "guest" ? <FanLoginScene items={["coin", "ticket", "stamp", "heart"].map((name) => ({ src: `/images/dukjil-duo/glyph-${name}-160.webp`, srcSet: `/images/dukjil-duo/glyph-${name}-160.webp 1x, /images/dukjil-duo/glyph-${name}-512.webp 3x` }))} title={[w.points, w.tickets, s("stanFlowStamps"), s("stanFlowHearts")].join(" · ")} action={state.action} /> : <div className={styles.card}>
      <div className={styles.column} data-column="tickets">
        <Link className={styles.result} data-cell="tickets" href={`/my/raffles?locale=${locale}` as Route}>
          <span className={styles.label}>{w.tickets} <span aria-hidden="true">›</span></span>
          <span className={styles.value}>{glyph("ticket")}<Value locale={locale} slot={tickets} unit={locale === "ko" ? "장" : undefined} /></span>
        </Link>
        <div className={styles.material} data-cell="points">
          {material(w.points, points, typeof points === "number" ? <><span>{points.toLocaleString(locale)}</span>/{pointCost.toLocaleString(locale)}P</> : points === "locked" ? <FanLockedValue locale={locale} /> : "—")}
          <FanGauge size="sm" className={styles.gauge} value={ready ? Math.min(state.points, pointCost) : 0} max={pointCost} label={s("walletNextTicket", [pointCost])} />
        </div>
        <FanAction variant="secondary" size="sm" fullWidth className={styles.action} disabled={!ready || (!pendingRequest.pending && (!affordable || !adReady))} onClick={() => setOpen(true)}>{adReady ? locale === "ko" ? "교환" : w.exchange : s("stanPreparing")}</FanAction>
      </div>
      {favoritePicker ? <div className={`${styles.column} ${styles.favoritePicker}`} data-cell="favorite-picker">{favoritePicker}</div> : <div className={styles.column} data-column="hearts">
        <Link className={styles.result} data-cell="hearts" href={links.hearts as Route}>
          <span className={styles.label}>{s("stanFlowHearts")} <span aria-hidden="true">›</span></span>
          <span className={styles.value}>{glyph("heart")}<Value locale={locale} slot={hearts} /></span>
        </Link>
        <div className={styles.material} data-cell="stamps">
          {material(s("stanFlowStamps"), stamps, typeof stamps === "number" ? <><span>{pageStamps}</span>/{STAMPS_PER_HEART}</> : stamps === "locked" ? <FanLockedValue locale={locale} /> : "—")}
          <FanGauge size="sm" className={styles.gauge} segments={STAMPS_PER_HEART} value={pageStamps} max={STAMPS_PER_HEART} label={s("stanFlowStamps")} />
        </div>
        <FanAction variant="secondary" size="sm" fullWidth className={styles.action} {...(claimable ? { href: links.claim! } : { disabled: true })}>{adReady ? s("stanClaim") : s("stanPreparing")}</FanAction>
      </div>}
      <div className={styles.guideColumn}>{guide("column")}</div>
    </div>}
    {state.kind === "failed" && state.retry ? <FanAction onClick={state.retry}>{w.retry}</FanAction> : null}
    <Overlay open={open && ready} onClose={() => setOpen(false)} labelledBy={titleId} backdropClassName={styles.backdrop} contentClassName={styles.sheet}>
      {!wide && <span className={styles.handle} aria-hidden="true" />}
      <div className={styles.sheetTitle}><FanHeading id={titleId}>{rewardedExchangeCopy(locale).action}</FanHeading></div><div className={styles.sheetBalance}><div className={styles.sheetLabel}>{w.points}</div><div className={styles.sheetValue}><Value locale={locale} slot={points} unit="P" /></div></div>
      {ready && <StanExchange locale={locale} points={state.points} pointCost={pointCost} pendingRequest={pendingRequest} onSuccess={() => setOpen(false)} />}
    </Overlay>
  </section>;
}
