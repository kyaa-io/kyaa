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

/** 덕질 wallet swap rows (대표 11/13 09:39): 덕질 has two sections, and each is headed by ONE line of the crypto-wallet swap —
 *  [my balance: label, asset + N / goal, thin bar] → [what I get: 보유 N, asset + 응모권 +1장 | 하트 +1개] [one button].
 *  `part` renders one row (tickets heads 럭키드로우, hearts heads 덕질 미션); without it both rows stack (fixtures). The button runs behind the
 *  rewarded ad (video icon), is primary only when it can be pressed, and reads 준비 중 without an ad unit. A guest sees the same row
 *  with locked values and the sign-in action in the button's place. */
export function StanWallet({ locale, state, stamps, hearts, links, className, favoritePicker, part }: { locale: AppLocale; state: WalletCardState; stamps: StanSlot; hearts: StanSlot; links: { hearts: string; claim?: string }; className?: string; favoritePicker?: ReactNode; part?: "tickets" | "hearts" }) {
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
  /** The balance side: label, asset + the real count over the goal (137P reads 137 / 100P; the bar stops at the goal), then a thin bar. */
  const from = (label: string, kind: "coin" | "stamp", slot: StanSlot, value: number, max: number, current: string, total: string, barLabel: string) => {
    const ratio = max > 0 ? Math.min(value, max) / max : 0, counted = typeof slot === "number";
    return <>
      <span className={styles.swapLabel}>{label}</span>
      <span className={styles.swapValue}>{asset(kind, 20, styles.swapAsset)}{counted ? <span className={styles.amount}><strong>{current}</strong>{` / ${total}`}</span> : <Value locale={locale} slot={slot} />}</span>
      {counted ? <span className={styles.bar} role="progressbar" aria-label={barLabel} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.min(value, max)} aria-valuetext={`${current} / ${total}`}>
        <span className={styles.barFill} style={{ "--wallet-bar-fill": `${ratio * 100}%` } as CSSProperties} aria-hidden="true" />
      </span> : null}
    </>;
  };
  /** One button per column. Both run behind the rewarded ad (the small video icon says so); with no ad unit it is the gray 준비 중. */
  const action = (name: string, enabled: boolean, extra: { onClick: () => void } | { href: string } | null) => state.kind === "guest" ? state.action : <FanAction variant={enabled ? "primary" : "neutral"} className={styles.reward} {...(enabled && extra ? extra : { disabled: true })} leadingIcon={adReady || enabled ? <FanIcon icon={SquarePlay} size={20} /> : undefined}>{adReady || enabled ? name : s("stanPreparing")}</FanAction>;
  const n = (value: number) => value.toLocaleString(locale);
  const ticketText = typeof points === "number" ? n(points) : "—";
  const held = (slot: StanSlot, unit: string) => typeof slot === "number" ? `${n(slot)}${unit}` : "—";
  const show = (name: "tickets" | "hearts") => !part || part === name;
  return <section className={[styles.wallet, className].filter(Boolean).join(" ")} id={part ? `wallet-${part}` : "wallet"} aria-label={part === "tickets" ? `${w.points} → ${w.tickets}` : part === "hearts" ? `${s("stanFlowStamps")} → ${s("stanFlowHearts")}` : s("stanWalletFlows")} data-wallet-card="stan" data-wallet-part={part}>
    {show("tickets") ? <div className={styles.swap} data-column="tickets">
      <div className={styles.from} data-cell="points">{from(w.points, "coin", points, ready ? state.points : 0, pointCost, ticketText, `${n(pointCost)}P`, s("walletNextTicket", [pointCost]))}</div>
      <span className={styles.arrow} aria-hidden="true">→</span>
      <Link className={styles.to} data-cell="tickets" href={`/my/raffles?locale=${locale}` as Route}>
        <span className={styles.swapLabel}>{typeof tickets === "number" ? s("stanHeld", [held(tickets, locale === "ko" ? "장" : "")]) : w.tickets}</span>
        <span className={styles.swapValue}>{asset("ticket", 20, styles.swapAsset)}<span className={styles.get}>{s("stanGetTicket")}</span></span>
      </Link>
      {action(locale === "ko" ? "교환" : w.exchange, ready && (Boolean(pendingRequest.pending) || (affordable && adReady)), { onClick: () => setOpen(true) })}
    </div> : null}
    {show("hearts") ? favoritePicker ? <div className={`${styles.swap} ${styles.favoritePicker}`} data-cell="favorite-picker">{favoritePicker}</div> : <div className={styles.swap} data-column="hearts">
      <div className={styles.from} data-cell="stamps">{from(s("stanFlowStamps"), "stamp", stamps, pageStamps, STAMPS_PER_HEART, typeof stamps === "number" ? String(pageStamps) : "—", String(STAMPS_PER_HEART), s("stanFlowStamps"))}</div>
      <span className={styles.arrow} aria-hidden="true">→</span>
      <Link className={styles.to} data-cell="hearts" href={links.hearts as Route}>
        <span className={styles.swapLabel}>{typeof hearts === "number" ? s("stanHeld", [held(hearts, "")]) : s("stanFlowHearts")}</span>
        <span className={styles.swapValue}>{asset("heart", 20, styles.swapAsset)}<span className={styles.get}>{s("stanGetHeart")}</span></span>
      </Link>
      {action(s("stanClaim"), claimable, links.claim ? { href: links.claim } : null)}
    </div> : null}
    {state.kind === "failed" && state.retry ? <FanAction onClick={state.retry}>{w.retry}</FanAction> : null}
    <Overlay open={open && ready} onClose={() => setOpen(false)} labelledBy={titleId} backdropClassName={styles.backdrop} contentClassName={styles.sheet}>
      {!wide && <span className={styles.handle} aria-hidden="true" />}
      <div className={styles.sheetTitle}><FanHeading id={titleId}>{rewardedExchangeCopy(locale).action}</FanHeading></div><div className={styles.sheetBalance}><div className={styles.sheetLabel}>{w.points}</div><div className={styles.sheetValue}><Value locale={locale} slot={points} unit="P" /></div></div>
      {ready && <StanExchange locale={locale} points={state.points} pointCost={pointCost} pendingRequest={pendingRequest} onSuccess={() => setOpen(false)} />}
    </Overlay>
  </section>;
}
