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
import { groupBenefitsCopy } from "@/features/groups/ui/group-benefits-copy";
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

/** The cheer cell (E5): the favorite's creator rank (null: outside the top 20) leads to the cheer card; without a favorite it leads to choosing one. */
export type StanCheer = { kind: "favorite"; name: string; rank: number | null | "loading" } | { kind: "pick"; href: string } | { kind: "menu"; node: ReactNode } | { kind: "loading" };

/** One linked cell: the link spans the label and the value; the help button sits over the label row beside the link, never inside it. */
function Cell({ label, help, children, href, next = false, cell }: { label: ReactNode; help?: ReactNode; children: ReactNode; href?: string; next?: boolean; cell: string }) {
  const inner = <><span className={styles.label}>{label}</span>{next ? <ArrowRight className={styles.next} size={12} strokeWidth={2.5} aria-hidden="true" /> : null}<span className={styles.value}>{children}</span></>;
  return <div className={styles.cell} data-cell={cell}>
    {href === undefined ? <div className={styles.cellLink}>{inner}</div> : href.startsWith("#") ? <a className={styles.cellLink} href={href}>{inner}</a> : <Link className={styles.cellLink} href={href as Route}>{inner}</Link>}
    {help ? <span className={styles.help}>{help}</span> : null}
  </div>;
}

function Value({ locale, slot, size, unit, icon }: { locale: AppLocale; slot: StanSlot; size: "xl" | "lg"; unit?: ReactNode; icon?: ReactNode }) {
  if (slot === "loading") return <FanSkeleton width={size === "xl" ? 96 : 64} height={size === "xl" ? 32 : 24} />;
  if (slot === "locked") return <FanLockedValue locale={locale} />;
  if (slot === "missing") return null;
  return <FanNumber value={slot} size={size} countUp locale={locale} unit={unit} icon={icon} />;
}

/** 덕질 wallet (feedback C9, E5): one line of six linked cells, points → tickets → lucky draws / stamps → hearts → cheer (390: two rows of three).
 *  No cell holds a button: each leads to the place its number grows or is used (history, my entries, the lucky-draw section, passports, the fan ranking, the cheer card).
 *  Stamps are the stamped slots of the passport page being filled (n/9, the same number as MY); nine fill a page and a page is a heart. Numbers count up only when they change. */
export function StanWallet({ locale, state, stamps, hearts, cheer, lucky, links, className }: { locale: AppLocale; state: WalletCardState; stamps: StanSlot; hearts: StanSlot; cheer: StanCheer; lucky: StanSlot; links: { hearts: string }; className?: string }) {
  const w = walletCopy(locale), h = walletHelpCopy(locale), s = (key: Parameters<typeof dukjilText>[1], values?: unknown[]) => dukjilText(locale, key, values);
  const luckyLabel = groupBenefitsCopy(locale).lucky, close = fanUiText(locale, "close");
  const [open, setOpen] = useState(false);
  const pointCost = state.kind === "ready" ? state.pointCost : GROUP_WALLET_POINT_COST;
  const points: StanSlot = state.kind === "ready" ? state.points : state.kind === "guest" ? "locked" : state.kind === "loading" ? "loading" : "missing";
  const tickets: StanSlot = state.kind === "ready" ? state.tickets : points;
  const ready = state.kind === "ready", affordable = ready && state.points >= pointCost;
  const toNext = ready ? pointCost - (state.points % pointCost) : pointCost;
  const coin = <img src={POINT_COIN_SRC} width={20} height={20} alt="" />, ticket = <img src="/images/economy/ticket.svg" width={20} height={20} alt="" />;
  const luckyValue = lucky === "loading" ? <FanSkeleton width={64} height={24} /> : lucky === "locked" ? <FanLockedValue locale={locale} /> : typeof lucky === "number" ? <strong className={styles.text} data-zero={lucky === 0 ? "" : undefined}>{s("flowLuckyOpen", [lucky.toLocaleString(locale)])}</strong> : null;
  const cheerValue = cheer.kind === "loading" || (cheer.kind === "favorite" && cheer.rank === "loading") ? <FanSkeleton width={96} height={24} />
    : cheer.kind === "favorite" ? <span className={styles.rank}><strong className={styles.text}>{typeof cheer.rank === "number" ? s("flowRank", [cheer.rank.toLocaleString(locale)]) : s("flowRankOut")}</strong><span className={styles.rankName}>{cheer.name}</span></span>
    : cheer.kind === "pick" ? <span className={styles.pick}>{s("heartPick")}<ArrowRight size={16} aria-hidden="true" /></span> : null;
  return <section className={[styles.wallet, className].filter(Boolean).join(" ")} aria-label={s("stanWalletFlows")} data-wallet-card="flows">
    <div className={styles.flows}>
      <div className={styles.flow} data-flow="tickets">
        <Cell cell="points" next href="#stan-history" label={w.points} help={<HelpHint label={h.label} text={h.points} />}><Value locale={locale} slot={points} size="xl" unit="P" icon={coin} /></Cell>
        <Cell cell="tickets" next href={`/my/raffles?locale=${locale}`} label={w.tickets} help={<HelpHint label={h.label} text={h.tickets} />}><Value locale={locale} slot={tickets} size="xl" unit={locale === "ko" ? "장" : undefined} icon={ticket} /></Cell>
        <Cell cell="lucky" href="#stan-lucky" label={luckyLabel}>{luckyValue}</Cell>
      </div>
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
      <div className={styles.flow} data-flow="hearts">
        <Cell cell="stamps" next href={`/passports?locale=${locale}`} label={s("stanFlowStamps")}><Value locale={locale} slot={stamps} size="lg" unit="/9" /></Cell>
        <Cell cell="hearts" next href={links.hearts} label={s("stanFlowHearts")} help={<FanHelpTip label={s("stanHeartHelp")} title={s("stanFlowHearts")} closeLabel={close}>{s("stanHeartHelp")}</FanHelpTip>}>
          <Value locale={locale} slot={hearts} size="lg" icon={<Heart size={20} strokeWidth={1.75} className={styles.heart} />} />
        </Cell>
        {cheer.kind === "menu" ? <div className={styles.cell} data-cell="cheer"><div className={styles.cellLink}><span className={styles.label}>{s("stanFlowCheer")}</span><span className={styles.value}>{cheer.node}</span></div></div>
          : <Cell cell="cheer" href={cheer.kind === "pick" ? cheer.href : "#stan-cheer"} label={s("stanFlowCheer")}>{cheerValue}</Cell>}
      </div>
    </div>
  </section>;
}
