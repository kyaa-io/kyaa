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

/** 덕질 wallet (사용자·대표 11/13 09:13~09:16, crypto-wallet benchmark: balance card + convert): two separate sections, 포인트 · 응모권 then
 *  스탬프 · 하트, never mixed in one card. Each section = its title, then one bordered box: the material balance big (3D coin | stamp + count)
 *  with what you hold on the right (보유 N, links to my raffles | hearts), then one line of progress (count over a thin bar) and the one
 *  conversion button (100P → 응모권 1장 | 스탬프 9 → 하트 1, video icon = after the rewarded ad). The button is primary only when it can be
 *  pressed; with no ad unit it reads 준비 중. 390: sections stack; 1024+: side by side. */
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
  /** Progress = the real count over a thin 8px bar (GPT review 11/13: the count never touches the fill). The fill stops at the goal; the
   *  count does not, so 137P reads 137 / 100P. */
  const progress = (label: string, slot: StanSlot, value: number, max: number, current: string, total: string) => {
    if (slot === "loading") return <FanSkeleton width="100%" height={28} />;
    if (slot === "locked") return <FanLockedValue locale={locale} />;
    const ratio = max > 0 ? Math.min(value, max) / max : 0;
    return <>
      <span className={styles.count} aria-hidden="true">{`${current} / ${total}`}</span>
      <span className={styles.bar} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.min(value, max)} aria-valuetext={`${current} / ${total}`}>
        <span className={styles.barFill} style={{ "--wallet-bar-fill": `${ratio * 100}%` } as CSSProperties} aria-hidden="true" />
      </span>
    </>;
  };
  /** One button per column. Both run behind the rewarded ad (the small video icon says so); with no ad unit it is the gray 준비 중. */
  const action = (name: string, enabled: boolean, extra: { onClick: () => void } | { href: string } | null) => <FanAction variant={enabled ? "primary" : "neutral"} className={styles.reward} {...(enabled && extra ? extra : { disabled: true })} leadingIcon={adReady || enabled ? <FanIcon icon={SquarePlay} size={20} /> : undefined}>{adReady || enabled ? name : s("stanPreparing")}</FanAction>;
  const n = (value: number) => value.toLocaleString(locale);
  const ticketText = typeof points === "number" ? n(points) : "—";
  const held = (slot: StanSlot, unit: string) => typeof slot === "number" ? `${n(slot)}${unit}` : "—";
  return <section className={[styles.wallet, className].filter(Boolean).join(" ")} id="wallet" aria-label={s("stanWalletFlows")} data-wallet-card="stan">
    <div className={styles.head}><FanHeading>{s("stanWalletFlows")}</FanHeading><FanAction variant="text" href={`/guide/dukjil?locale=${locale}`}>{s("stanGuide")} ›</FanAction></div>
    {state.kind === "guest" ? <FanLoginScene items={(["coin", "ticket", "stamp", "heart"] as const).map((name) => ({ src: WALLET_ASSETS[name] }))} title={[w.points, w.tickets, s("stanFlowStamps"), s("stanFlowHearts")].join(" · ")} action={state.action} /> : <div className={styles.sections}>
      <section className={styles.flow} data-column="tickets" aria-labelledby={`${titleId}-tickets`}>
        <p className={styles.flowTitle} id={`${titleId}-tickets`}>{w.points} · {w.tickets}</p>
        <div className={styles.box} data-cell="points">
          <div className={styles.balance}>
            {asset("coin", 32, styles.balanceAsset)}
            <span className={styles.value}><Value locale={locale} slot={points} unit="P" /></span>
            <Link className={styles.held} data-cell="tickets" href={`/my/raffles?locale=${locale}` as Route} aria-label={`${w.tickets} ${typeof tickets === "number" ? n(tickets) : ""}`.trim()}>
              {asset("ticket", 20, styles.heldAsset)}<span aria-hidden="true">{s("stanHeld", [held(tickets, locale === "ko" ? "장" : "")])}</span><span className={styles.chevron} aria-hidden="true">›</span>
            </Link>
          </div>
          <div className={styles.act}>
            <div className={styles.progress}>{progress(s("walletNextTicket", [pointCost]), points, ready ? state.points : 0, pointCost, ticketText, `${n(pointCost)}P`)}</div>
            {action(s("stanConvertTicket", [n(pointCost)]), ready && (Boolean(pendingRequest.pending) || (affordable && adReady)), { onClick: () => setOpen(true) })}
          </div>
        </div>
      </section>
      {favoritePicker ? <section className={`${styles.flow} ${styles.favoritePicker}`} data-cell="favorite-picker">{favoritePicker}</section> : <section className={styles.flow} data-column="hearts" aria-labelledby={`${titleId}-hearts`}>
        <p className={styles.flowTitle} id={`${titleId}-hearts`}>{s("stanFlowStamps")} · {s("stanFlowHearts")}</p>
        <div className={styles.box} data-cell="stamps">
          <div className={styles.balance}>
            {asset("stamp", 32, styles.balanceAsset)}
            <span className={styles.value}><Value locale={locale} slot={stamps} unit={locale === "ko" ? "개" : undefined} /></span>
            <Link className={styles.held} data-cell="hearts" href={links.hearts as Route} aria-label={`${s("stanFlowHearts")} ${typeof hearts === "number" ? n(hearts) : ""}`.trim()}>
              {asset("heart", 20, styles.heldAsset)}<span aria-hidden="true">{s("stanHeld", [held(hearts, "")])}</span><span className={styles.chevron} aria-hidden="true">›</span>
            </Link>
          </div>
          <div className={styles.act}>
            <div className={styles.progress}>{progress(s("stanFlowStamps"), stamps, pageStamps, STAMPS_PER_HEART, typeof stamps === "number" ? String(pageStamps) : "—", String(STAMPS_PER_HEART))}</div>
            {action(s("stanConvertHeart", [STAMPS_PER_HEART]), claimable, links.claim ? { href: links.claim } : null)}
          </div>
        </div>
      </section>}
    </div>}
    {state.kind === "failed" && state.retry ? <FanAction onClick={state.retry}>{w.retry}</FanAction> : null}
    <Overlay open={open && ready} onClose={() => setOpen(false)} labelledBy={titleId} backdropClassName={styles.backdrop} contentClassName={styles.sheet}>
      {!wide && <span className={styles.handle} aria-hidden="true" />}
      <div className={styles.sheetTitle}><FanHeading id={titleId}>{rewardedExchangeCopy(locale).action}</FanHeading></div><div className={styles.sheetBalance}><div className={styles.sheetLabel}>{w.points}</div><div className={styles.sheetValue}><Value locale={locale} slot={points} unit="P" /></div></div>
      {ready && <StanExchange locale={locale} points={state.points} pointCost={pointCost} pendingRequest={pendingRequest} onSuccess={() => setOpen(false)} />}
    </Overlay>
  </section>;
}
