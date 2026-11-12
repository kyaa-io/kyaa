"use client";
import { RewardIcon, REWARD_ICON_SRC } from "@/components/fan-ui/reward-icon";
import Link from "../../../components/fan-ui/hover-prefetch-link";
import type { Route } from "next";
import { SquarePlay } from "@/components/fan-ui/fan-icons";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import type { CSSProperties } from "react";
import { useId, useState, useSyncExternalStore, type ReactNode } from "react";
import { BottomSheet, Dialog } from "@/components/ui/overlay/accessible-overlay";
import { useFanWide } from "@/components/fan-ui/fan-dialog";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanLockedValue } from "@/components/fan-ui/fan-locked-value";
import { FanLoginScene } from "@/components/fan-ui/fan-login-scene";
import { FanNumber } from "@/components/fan-ui/fan-number";
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

const WALLET_ASSETS = { coin: REWARD_ICON_SRC.point, ticket: REWARD_ICON_SRC.ticket, heart: REWARD_ICON_SRC.heart, stamp: REWARD_ICON_SRC.stamp } as const;

export type StanSlot = "loading" | "locked" | "missing" | number;

function Value({ locale, slot, unit }: { locale: AppLocale; slot: StanSlot; unit?: ReactNode }) {
  if (slot === "loading") return <FanSkeleton width={48} height={28} />;
  if (slot === "locked") return <FanLockedValue locale={locale} />;
  if (slot === "missing") return <span>—</span>;
  return <FanNumber size="lg" value={slot} countUp locale={locale} unit={unit} className={styles.number} />;
}

/** The ad unit comes from a meta tag in the browser; the server render never has it, so the buttons start disabled. */
const noSubscribe = () => () => {};
function useRewardedAdReady() {
  return useSyncExternalStore(noSubscribe, () => Boolean(rewardedAdUnit()), () => false);
}

/** 덕질 wallet (대표 11/11 10:37 구성, 사용자 13:28 imagegen 시안 채택 — board/tasks/wallet-redesign-1130/mockups): two columns, tickets | hearts.
 *  Each column is the result box (big 3D asset + 응모권 N장 | 하트 N), a hairline, the material row (3D coin | stamp, name, big count,
 *  thick bar with the count inside and 교환 가능 | 받기 가능 inside it when full, the rule line) and ONE button (교환 | 받기 with the small video icon = ad).
 *  Both buttons run behind the rewarded ad, so while no ad unit is set they are disabled and read 준비 중. The guide is a ? next to the heading.
 *  390: the columns stack; 1024+: side by side in one card. */
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
  const asset = (name: keyof typeof WALLET_ASSETS, size: number, className: string) => <RewardIcon kind={name === "coin" ? "point" : name} size={size} className={className} />;
  /** Thick round bar with the count inside (the filled part repeats it in white); a full bar gets the 완료! stamp at its end. */
  const bar = (label: string, slot: StanSlot, value: number, max: number, current: string, total: string, doneText?: string, full = max > 0 && value >= max) => slot === "loading" ? <FanSkeleton width="100%" height={24} /> : slot === "locked" ? <FanLockedValue locale={locale} /> : <span className={styles.barRow}>
    <span className={styles.bar} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.min(value, max)} aria-valuetext={`${current} / ${total}`}>
      <span className={styles.barText} aria-hidden="true">{full ? doneText : `${current} / ${total}`}</span>
      <span className={styles.barFill} style={{ "--wallet-bar-unfilled": `${100 - (max > 0 ? Math.min(value, max) / max : 0) * 100}%` } as CSSProperties} aria-hidden="true"><span className={styles.barText}>{full ? doneText : `${current} / ${total}`}</span></span>
    </span>
  </span>;
  /** One button per column. Both run behind the rewarded ad (the small video icon says so); with no ad unit it is the gray 준비 중. */
  const action = (name: string, enabled: boolean, extra: { onClick: () => void } | { href: string } | null) => <FanAction variant="primary" className={styles.reward} {...(enabled && extra ? extra : { disabled: true })} leadingIcon={adReady || enabled ? <FanIcon icon={SquarePlay} size={20} /> : undefined}>{adReady || enabled ? name : s("stanPreparing")}</FanAction>;
  const n = (value: number) => value.toLocaleString(locale);
  const ticketText = typeof points === "number" ? n(Math.min(points, pointCost)) : "—";
  return <section className={[styles.wallet, className].filter(Boolean).join(" ")} id="wallet" aria-label={s("stanWalletFlows")} data-wallet-card="stan">
    <div className={styles.head}><FanHeading>{s("stanWalletFlows")}</FanHeading><FanAction variant="text" href={`/guide/dukjil?locale=${locale}`}>{s("stanGuide")} ›</FanAction></div>
    {state.kind === "guest" ? <FanLoginScene items={(["coin", "ticket", "stamp", "heart"] as const).map((name) => ({ src: WALLET_ASSETS[name] }))} title={[w.points, w.tickets, s("stanFlowStamps"), s("stanFlowHearts")].join(" · ")} action={state.action} /> : <div className={styles.card}>
      <div className={styles.column} data-column="tickets">
        <Link className={styles.result} data-cell="tickets" href={`/my/raffles?locale=${locale}` as Route}>
          {asset("ticket", 56, styles.resultAsset)}
          <span className={styles.resultText}><span className={styles.label}>{w.tickets}</span><span className={styles.value}><Value locale={locale} slot={tickets} unit={locale === "ko" ? "장" : undefined} /></span></span>
        </Link>
        <div className={styles.material} data-cell="points">
          {asset("coin", 56, styles.asset)}
          <span className={styles.name}>{w.points}</span>
          <span className={styles.amount}><Value locale={locale} slot={points} unit="P" /></span>
          <div className={styles.progress}>{bar(s("walletNextTicket", [pointCost]), points, ready ? state.points : 0, pointCost, ticketText, `${n(pointCost)}P`, s("walletExchangeReady"))}</div>
          <span className={styles.rule}>{s("stanRuleTicket", [pointCost])}</span>
          {action(locale === "ko" ? "교환" : w.exchange, ready && (Boolean(pendingRequest.pending) || (affordable && adReady)), { onClick: () => setOpen(true) })}
        </div>
      </div>
      {favoritePicker ? <div className={`${styles.column} ${styles.favoritePicker}`} data-cell="favorite-picker">{favoritePicker}</div> : <div className={styles.column} data-column="hearts">
        <Link className={styles.result} data-cell="hearts" href={links.hearts as Route}>
          {asset("heart", 56, styles.resultAsset)}
          <span className={styles.resultText}><span className={styles.label}>{s("stanFlowHearts")}</span><span className={styles.value}><Value locale={locale} slot={hearts} /></span></span>
        </Link>
        <div className={styles.material} data-cell="stamps">
          {asset("stamp", 56, styles.asset)}
          <span className={styles.name}>{s("stanFlowStamps")}</span>
          <span className={styles.amount}><Value locale={locale} slot={stamps} unit={locale === "ko" ? "개" : undefined} /></span>
          <div className={styles.progress}>{bar(s("stanFlowStamps"), stamps, pageStamps, STAMPS_PER_HEART, typeof stamps === "number" ? String(pageStamps) : "—", String(STAMPS_PER_HEART), s("stanClaimReady"))}</div>
          <span className={styles.rule}>{s("stanRuleHeart", [STAMPS_PER_HEART])}</span>
          {action(s("stanClaim"), claimable, links.claim ? { href: links.claim } : null)}
        </div>
      </div>}
    </div>}
    {state.kind === "failed" && state.retry ? <FanAction onClick={state.retry}>{w.retry}</FanAction> : null}
    <Overlay open={open && ready} onClose={() => setOpen(false)} labelledBy={titleId} backdropClassName={styles.backdrop} contentClassName={styles.sheet}>
      {!wide && <span className={styles.handle} aria-hidden="true" />}
      <div className={styles.sheetTitle}><FanHeading id={titleId}>{rewardedExchangeCopy(locale).action}</FanHeading></div><div className={styles.sheetBalance}><div className={styles.sheetLabel}>{w.points}</div><div className={styles.sheetValue}><Value locale={locale} slot={points} unit="P" /></div></div>
      {ready && <StanExchange locale={locale} points={state.points} pointCost={pointCost} pendingRequest={pendingRequest} onSuccess={() => setOpen(false)} />}
    </Overlay>
  </section>;
}
