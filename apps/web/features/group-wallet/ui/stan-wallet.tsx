"use client";
import { ArrowRight, Heart } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { useState, type ReactNode } from "react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHelpTip } from "@/components/fan-ui/fan-help-tip";
import { FanLockedValue } from "@/components/fan-ui/fan-locked-value";
import { FanGauge, FanNumber } from "@/components/fan-ui/fan-number";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { fanUiText } from "@/components/fan-ui/fan-ui-copy";
import { dukjilText } from "@/features/dukjil/ui/dukjil-copy";
import { POINT_COIN_SRC } from "@/features/dukjil/ui/earn-badge";
import { raffleCopy } from "@/features/group-raffle/copy";
import { benefitsRaffleState, groupBenefitsCopy } from "@/features/groups/ui/group-benefits-copy";
import type { AppLocale } from "@/i18n/locales";
import { GROUP_WALLET_POINT_COST } from "@/server/group-wallet/domain";
import { walletCopy, walletHelpCopy } from "./copy";
import { HelpHint } from "./help-hint";
import { rewardedExchangeCopy } from "./rewarded-copy";
import { WalletRate, type WalletCardState } from "./wallet-card";
import { WalletExchangeDialog } from "./wallet-screen";
import styles from "./stan-wallet.module.css";

/** A number slot: loading holds the size of the number, locked is the signed-out lock, missing draws nothing (the failure is told elsewhere). */
export type StanSlot = "loading" | "locked" | "missing" | number;

/** The cheer cell: heart cheering is not open yet (feedback D15), so it names the favorite on a disabled button; without one it leads to choosing. */
export type StanCheer = { kind: "favorite"; name: string } | { kind: "pick"; href: string } | { kind: "loading" };

function Cell({ label, help, children, next = false }: { label: ReactNode; help?: ReactNode; children: ReactNode; next?: boolean }) {
  return <div className={styles.cell}>
    <dt className={styles.label}><span>{label}</span>{help}{next ? <ArrowRight className={styles.next} size={12} strokeWidth={2.5} aria-hidden="true" /> : null}</dt>
    <dd className={styles.value}>{children}</dd>
  </div>;
}

function Value({ locale, slot, size, unit, icon }: { locale: AppLocale; slot: StanSlot; size: "xl" | "lg"; unit?: ReactNode; icon?: ReactNode }) {
  if (slot === "loading") return <FanSkeleton width={size === "xl" ? 96 : 64} height={size === "xl" ? 32 : 24} />;
  if (slot === "locked") return <FanLockedValue locale={locale} />;
  if (slot === "missing") return null;
  return <FanNumber value={slot} size={size} countUp locale={locale} unit={unit} icon={icon} />;
}

/** 덕질 wallet (feedback C9): two flows read left to right.
 *  points → tickets → lucky draw (open later: its button stays, disabled, with the reason behind a help tip)
 *  stamps → hearts → cheering the favorite (also open later, D15: same disabled button and reason). Stamps are the stamped slots of the passport page being filled (n/9, the same number as MY);
 *  nine fill a page and a page is a heart. Numbers count up only when they change. The exchange is the secondary action. */
export function StanWallet({ locale, state, stamps, hearts, cheer, className }: { locale: AppLocale; state: WalletCardState; stamps: StanSlot; hearts: StanSlot; cheer: StanCheer; className?: string }) {
  const w = walletCopy(locale), h = walletHelpCopy(locale), s = (key: Parameters<typeof dukjilText>[1], values?: unknown[]) => dukjilText(locale, key, values);
  const lucky = groupBenefitsCopy(locale).lucky, preparing = benefitsRaffleState(locale, "preparing"), close = fanUiText(locale, "close");
  const [open, setOpen] = useState(false);
  const pointCost = state.kind === "ready" ? state.pointCost : GROUP_WALLET_POINT_COST;
  const points: StanSlot = state.kind === "ready" ? state.points : state.kind === "guest" ? "locked" : state.kind === "loading" ? "loading" : "missing";
  const tickets: StanSlot = state.kind === "ready" ? state.tickets : points;
  const ready = state.kind === "ready", affordable = ready && state.points >= pointCost;
  const toNext = ready ? pointCost - (state.points % pointCost) : pointCost;
  const coin = <img src={POINT_COIN_SRC} width={20} height={20} alt="" />, ticket = <img src="/images/economy/ticket.svg" width={20} height={20} alt="" />;
  return <section className={[styles.wallet, className].filter(Boolean).join(" ")} aria-label={s("stanWalletFlows")} data-wallet-card="flows">
    <dl className={styles.flow} data-flow="tickets">
      <Cell next label={w.points} help={<HelpHint label={h.label} text={h.points} />}><Value locale={locale} slot={points} size="xl" unit="P" icon={coin} /></Cell>
      <Cell next label={w.tickets} help={<HelpHint label={h.label} text={h.tickets} />}><Value locale={locale} slot={tickets} size="xl" unit={locale === "ko" ? "장" : undefined} icon={ticket} /></Cell>
      <Cell label={lucky} help={<FanHelpTip label={preparing} title={lucky} closeLabel={close}>{preparing}</FanHelpTip>}>
        <FanAction variant="secondary" size="sm" disabled className={styles.cellAction}>{raffleCopy(locale).enter}</FanAction>
      </Cell>
    </dl>
    <div className={styles.exchange}>
      <div className={styles.gauge}>
        <FanGauge size="sm" value={ready ? (affordable ? pointCost : state.points % pointCost) : 0} max={pointCost} label={s("walletNextTicket", [toNext.toLocaleString(locale)])}
          valueText={ready ? (affordable ? <strong className={styles.ready}>{s("walletExchangeReady")}</strong> : s("walletNextTicket", [toNext.toLocaleString(locale)])) : <WalletRate locale={locale} pointCost={pointCost} />} />
      </div>
      {state.kind === "guest" ? <div className={styles.exchangeAction}>{state.action}</div>
        : state.kind === "loading" ? <div className={styles.exchangeAction}><FanSkeleton shape="block" width="100%" height={44} /></div>
        : state.kind === "failed" ? (state.retry ? <div className={styles.exchangeAction}><FanAction onClick={state.retry}>{w.retry}</FanAction></div> : null)
        : <div className={styles.exchangeAction}><FanAction variant="secondary" fullWidth disabled={!affordable} onClick={() => setOpen(true)}>{rewardedExchangeCopy(locale).action}</FanAction><WalletExchangeDialog locale={locale} open={open} onClose={() => setOpen(false)} /></div>}
    </div>
    <dl className={styles.flow} data-flow="hearts">
      <Cell next label={s("stanFlowStamps")}><Value locale={locale} slot={stamps} size="lg" unit="/9" /></Cell>
      <Cell next label={s("stanFlowHearts")} help={<FanHelpTip label={s("stanHeartHelp")} title={s("stanFlowHearts")} closeLabel={close}>{s("stanHeartHelp")}</FanHelpTip>}>
        <Value locale={locale} slot={hearts} size="lg" icon={<Heart size={20} strokeWidth={1.75} className={styles.heart} />} />
      </Cell>
      <Cell label={s("stanFlowCheer")} help={<FanHelpTip label={preparing} title={s("stanFlowCheer")} closeLabel={close}>{preparing}</FanHelpTip>}>
        {cheer.kind === "loading" ? <FanSkeleton width={120} height={20} />
          : cheer.kind === "favorite" ? <FanAction variant="secondary" size="sm" disabled className={styles.cellAction}>{s("heartGo", [cheer.name])}</FanAction>
          : <Link className={styles.cheer} href={cheer.href as Route}><span>{s("heartPick")}</span><ArrowRight size={16} aria-hidden="true" /></Link>}
      </Cell>
    </dl>
  </section>;
}
