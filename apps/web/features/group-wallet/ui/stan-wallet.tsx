"use client";
import { RewardIcon, REWARD_ICON_SRC } from "@/components/fan-ui/reward-icon";
import Link from "../../../components/fan-ui/hover-prefetch-link";
import type { Route } from "next";
import { ArrowDown, SquarePlay } from "@/components/fan-ui/fan-icons";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import type { AnimationEvent, CSSProperties } from "react";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { BottomSheet, Dialog } from "@/components/ui/overlay/accessible-overlay";
import { useFanWide } from "@/components/fan-ui/fan-dialog";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanLockedValue } from "@/components/fan-ui/fan-locked-value";
import { FanNumber } from "@/components/fan-ui/fan-number";
import { FanText } from "@/components/fan-ui/fan-text";
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

/** True once a balance moves from one number to another (an exchange, a claim), until the cell's highlight ends. Loading → number never flashes. */
function useBalanceFlash(slot: StanSlot): [boolean, (event: AnimationEvent) => void] {
  const [flash, setFlash] = useState(false);
  const previous = useRef(slot);
  useEffect(() => {
    const before = previous.current;
    previous.current = slot;
    if (typeof before === "number" && typeof slot === "number" && before !== slot) setFlash(true);
  }, [slot]);
  // Only the cell's own highlight ends it, not an animation inside the cell (a skeleton, a number pulse).
  return [flash, (event) => { if (event.target === event.currentTarget) setFlash(false); }];
}

/** The ad unit comes from a meta tag in the browser; the server render never has it, so the buttons start disabled. */
const noSubscribe = () => () => {};
function useRewardedAdReady() {
  return useSyncExternalStore(noSubscribe, () => Boolean(rewardedAdUnit()), () => false);
}

/** 덕질 wallet swap cards (대표 11/13 09:39 + 사용자 13:2x 환전기 벤치마크): each section is headed by ONE converter —
 *  two stacked cells, what I give on top (asset, name, 보유 N, 사용 cost, a thin bar toward the cost) and what I get below (asset, name,
 *  보유 N, 획득 1), a joint chip on the seam, then one wide button. ≥1024 lays the same cells side by side with the button at the end.
 *  `part` renders one card (tickets heads 럭키드로우, hearts heads 덕질 미션); without it both stack (fixtures). The button runs behind the
 *  rewarded ad (video icon in every state), is primary only when it can be pressed, and reads 준비 중 without an ad unit. A guest sees
 *  the same cells with locked values and the sign-in action in the button's place. */
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
  const n = (value: number) => value.toLocaleString(locale);
  const ko = locale === "ko";
  /** 보유 N: the real balance (137P stays 137P past the cost), or the locked / loading mark in the same line. A balance that failed to load leaves the line empty (the section's own error and retry say so) — no dash. */
  const held = (slot: StanSlot, text: string) => typeof slot === "number" ? s("stanHeld", [text]) : slot === "loading" ? <FanSkeleton width={64} height={16} /> : slot === "locked" ? <FanLockedValue locale={locale} /> : null;
  /** The amount carries a word, not a sign (대표 11/13 20:36: −100P read as a loss): 포인트 100P 사용 → 응모권 1장 획득. */
  const amount = (side: "spend" | "gain", value: number, unit: string) => <span className={styles.amount}>
    <FanNumber size="lg" value={value} unit={unit || undefined} locale={locale} />
    <FanText role="meta" className={styles.amountLabel}>{s(side === "spend" ? "stanSpend" : "stanGain")}</FanText>
  </span>;
  type Side = { cell: string; kind: keyof typeof WALLET_ASSETS; name: string; held: ReactNode; amount: ReactNode; flash: [boolean, (event: AnimationEvent) => void]; bar?: { value: number; max: number; text: string; label: string } };
  /** Main line: name + amount + 사용/획득. Under it, smaller, the balance (and the gauge toward the cost) — what I have never competes with what moves. */
  const body = (side: Side) => <>
    <RewardIcon kind={side.kind === "coin" ? "point" : side.kind} size={40} className={styles.cellAsset} />
    <span className={styles.cellText}><span className={styles.cellMain}><FanText role="item" className={styles.cellName}>{side.name}</FanText>{side.amount}</span><FanText role="meta" className={styles.cellHeld}><span className={styles.heldText}>{side.held}</span>{side.bar ? <span className={styles.bar} role="progressbar" aria-label={side.bar.label} aria-valuemin={0} aria-valuemax={side.bar.max} aria-valuenow={Math.min(side.bar.value, side.bar.max)} aria-valuetext={side.bar.text}>
      <span className={styles.barFill} style={{ "--wallet-bar-fill": `${(side.bar.max > 0 ? Math.min(side.bar.value, side.bar.max) / side.bar.max : 0) * 100}%` } as CSSProperties} aria-hidden="true" />
    </span> : null}</FanText></span>
  </>;
  /** One button per card, as wide as the cells. Both run behind the rewarded ad (the video icon says so); with no ad unit it is the gray 준비 중. */
  const action = (name: string, enabled: boolean, extra: { onClick: () => void } | { href: string } | null) => state.kind === "guest" ? state.action : <FanAction variant={enabled ? "primary" : "neutral"} className={styles.reward} {...(enabled && extra ? extra : { disabled: true })} leadingIcon={<FanIcon icon={SquarePlay} size={20} />}>{adReady || enabled ? name : s("stanPreparing")}</FanAction>;
  const swap = (column: "tickets" | "hearts", from: Side, to: Side, href: string, button: ReactNode) => <div className={styles.swap} data-column={column}>
    <div className={styles.cells}>
      <div className={styles.cell} data-cell={from.cell} data-side="from" data-changed={from.flash[0] || undefined} onAnimationEnd={from.flash[1]}>{body(from)}</div>
      <span className={styles.joint} aria-hidden="true"><FanIcon icon={ArrowDown} size={16} /></span>
      <Link className={styles.cell} data-cell={to.cell} data-side="to" data-changed={to.flash[0] || undefined} onAnimationEnd={to.flash[1]} href={href as Route}>{body(to)}</Link>
    </div>
    {button}
  </div>;
  const flashes = { points: useBalanceFlash(points), tickets: useBalanceFlash(tickets), stamps: useBalanceFlash(stamps), hearts: useBalanceFlash(hearts) };
  const show = (name: "tickets" | "hearts") => !part || part === name;
  const pointValue = ready ? state.points : 0;
  return <section className={[styles.wallet, className].filter(Boolean).join(" ")} id={part ? `wallet-${part}` : "wallet"} aria-label={part === "tickets" ? `${w.points} → ${w.tickets}` : part === "hearts" ? `${s("stanFlowStamps")} → ${s("stanFlowHearts")}` : s("stanWalletFlows")} data-wallet-card="stan" data-wallet-part={part}>
    {show("tickets") ? swap("tickets",
      { cell: "points", flash: flashes.points, kind: "coin", name: w.points, held: held(points, typeof points === "number" ? `${n(points)}P` : ""), amount: amount("spend", pointCost, "P"),
        bar: typeof points === "number" ? { value: pointValue, max: pointCost, text: `${n(pointValue)} / ${n(pointCost)}P`, label: s("walletNextTicket", [pointCost]) } : undefined },
      { cell: "tickets", flash: flashes.tickets, kind: "ticket", name: w.tickets, held: held(tickets, typeof tickets === "number" ? `${n(tickets)}${ko ? "장" : ""}` : ""), amount: amount("gain", 1, ko ? "장" : "") },
      `/my/raffles?locale=${locale}`,
      action(ko ? "교환" : w.exchange, ready && (Boolean(pendingRequest.pending) || (affordable && adReady)), { onClick: () => setOpen(true) })) : null}
    {show("hearts") ? favoritePicker ? <div className={`${styles.swap} ${styles.favoritePicker}`} data-cell="favorite-picker">{favoritePicker}</div> : swap("hearts",
      { cell: "stamps", flash: flashes.stamps, kind: "stamp", name: s("stanFlowStamps"), held: held(stamps, `${pageStamps} / ${STAMPS_PER_HEART}`), amount: amount("spend", STAMPS_PER_HEART, ko ? "개" : ""),
        bar: typeof stamps === "number" ? { value: pageStamps, max: STAMPS_PER_HEART, text: `${pageStamps} / ${STAMPS_PER_HEART}`, label: s("stanFlowStamps") } : undefined },
      { cell: "hearts", flash: flashes.hearts, kind: "heart", name: s("stanFlowHearts"), held: held(hearts, typeof hearts === "number" ? `${n(hearts)}${ko ? "개" : ""}` : ""), amount: amount("gain", 1, ko ? "개" : "") },
      links.hearts,
      action(s("stanClaim"), claimable, links.claim ? { href: links.claim } : null)) : null}
    {state.kind === "failed" && state.retry ? <FanAction onClick={state.retry}>{w.retry}</FanAction> : null}
    <Overlay open={open && ready} onClose={() => setOpen(false)} labelledBy={titleId} backdropClassName={styles.backdrop} contentClassName={styles.sheet}>
      {!wide && <span className={styles.handle} aria-hidden="true" />}
      <div className={styles.sheetTitle}><FanHeading id={titleId}>{rewardedExchangeCopy(locale).action}</FanHeading></div><div className={styles.sheetBalance}><div className={styles.sheetLabel}>{w.points}</div><div className={styles.sheetValue}><Value locale={locale} slot={points} unit="P" /></div></div>
      {ready && <StanExchange locale={locale} points={state.points} pointCost={pointCost} pendingRequest={pendingRequest} onSuccess={() => setOpen(false)} />}
    </Overlay>
  </section>;
}
