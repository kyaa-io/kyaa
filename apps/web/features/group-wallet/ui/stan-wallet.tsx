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
 *  대표 11/13 09:09 "여백이 너무 크고 어떻게 써야 할지 직관적이지 않음": each flow is two lines in one card — result (asset 40, 응모권 N장 | 하트 N)
 *  with its one button on the right, then the material line (asset 24, the 24px bar with N/M inside, → reward +1). The button is primary
 *  only when it can be pressed; otherwise neutral. 390: the flows stack in one card; 1024+: side by side. */
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
  /** Thick round bar with the real count inside. The fill stops at the goal; the count does not, so 137P reads 137 / 100P. The count never
   *  straddles the fill's round end (it cut the glyph in half, GPT review 11/13): from half full it sits centred in the fill in white,
   *  below half centred in the empty part in ink. Ready is shown by the goal turning accent and the button turning primary. */
  const bar = (label: string, slot: StanSlot, value: number, max: number, current: string, total: string) => {
    if (slot === "loading") return <FanSkeleton width="100%" height={24} />;
    if (slot === "locked") return <FanLockedValue locale={locale} />;
    const ratio = max > 0 ? Math.min(value, max) / max : 0;
    return <span className={styles.barRow}>
      <span className={styles.bar} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.min(value, max)} aria-valuetext={`${current} / ${total}`} style={{ "--wallet-bar-fill": `${ratio * 100}%` } as CSSProperties}>
        <span className={styles.barFill} aria-hidden="true" />
        <span className={styles.barText} data-on-fill={ratio >= 0.5 || undefined} aria-hidden="true"><span>{current}</span>{` / ${total}`}</span>
      </span>
    </span>;
  };
  /** One button per column. Both run behind the rewarded ad (the small video icon says so); with no ad unit it is the gray 준비 중. */
  const action = (name: string, enabled: boolean, extra: { onClick: () => void } | { href: string } | null) => <FanAction variant={enabled ? "primary" : "neutral"} className={styles.reward} {...(enabled && extra ? extra : { disabled: true })} leadingIcon={adReady || enabled ? <FanIcon icon={SquarePlay} size={20} /> : undefined}>{adReady || enabled ? name : s("stanPreparing")}</FanAction>;
  /** The bar ends in what it turns into: → 응모권 +1 | 하트 +1. The rule sentence is its accessible name, so nothing extra is printed. */
  const goal = (kind: "ticket" | "heart", rule: string, ready: boolean) => <span className={styles.goal} data-ready={ready || undefined} role="img" aria-label={rule}><span aria-hidden="true">→</span><RewardIcon kind={kind} size={20} /><span aria-hidden="true">+1</span></span>;
  const n = (value: number) => value.toLocaleString(locale);
  const ticketText = typeof points === "number" ? n(points) : "—";
  return <section className={[styles.wallet, className].filter(Boolean).join(" ")} id="wallet" aria-label={s("stanWalletFlows")} data-wallet-card="stan">
    <div className={styles.head}><FanHeading>{s("stanWalletFlows")}</FanHeading><FanAction variant="text" href={`/guide/dukjil?locale=${locale}`}>{s("stanGuide")} ›</FanAction></div>
    {state.kind === "guest" ? <FanLoginScene items={(["coin", "ticket", "stamp", "heart"] as const).map((name) => ({ src: WALLET_ASSETS[name] }))} title={[w.points, w.tickets, s("stanFlowStamps"), s("stanFlowHearts")].join(" · ")} action={state.action} /> : <div className={styles.card}>
      <div className={styles.column} data-column="tickets">
        <div className={styles.top}>
          <Link className={styles.result} data-cell="tickets" href={`/my/raffles?locale=${locale}` as Route}>
            {asset("ticket", 40, styles.resultAsset)}
            <span className={styles.label}>{w.tickets}</span><span className={styles.value}><Value locale={locale} slot={tickets} unit={locale === "ko" ? "장" : undefined} /></span>
          </Link>
          {action(locale === "ko" ? "교환" : w.exchange, ready && (Boolean(pendingRequest.pending) || (affordable && adReady)), { onClick: () => setOpen(true) })}
        </div>
        <div className={styles.material} data-cell="points">
          {asset("coin", 24, styles.asset)}
          <div className={styles.progress}>{bar(s("walletNextTicket", [pointCost]), points, ready ? state.points : 0, pointCost, ticketText, `${n(pointCost)}P`)}</div>
          {goal("ticket", s("stanRuleTicket", [pointCost]), affordable)}
        </div>
      </div>
      {favoritePicker ? <div className={`${styles.column} ${styles.favoritePicker}`} data-cell="favorite-picker">{favoritePicker}</div> : <div className={styles.column} data-column="hearts">
        <div className={styles.top}>
          <Link className={styles.result} data-cell="hearts" href={links.hearts as Route}>
            {asset("heart", 40, styles.resultAsset)}
            <span className={styles.label}>{s("stanFlowHearts")}</span><span className={styles.value}><Value locale={locale} slot={hearts} /></span>
          </Link>
          {action(s("stanClaim"), claimable, links.claim ? { href: links.claim } : null)}
        </div>
        <div className={styles.material} data-cell="stamps">
          {asset("stamp", 24, styles.asset)}
          <div className={styles.progress}>{bar(s("stanFlowStamps"), stamps, pageStamps, STAMPS_PER_HEART, typeof stamps === "number" ? String(pageStamps) : "—", String(STAMPS_PER_HEART))}</div>
          {goal("heart", s("stanRuleHeart", [STAMPS_PER_HEART]), full)}
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
