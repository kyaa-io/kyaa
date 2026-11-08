"use client";
import Link from "next/link";
import type { Route } from "next";
import { ChevronRight, Plus } from "@/components/fan-ui/stan-icons";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import type { ReactNode } from "react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanLockedValue } from "@/components/fan-ui/fan-locked-value";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { benefitListResponseSchema } from "@/features/benefit/domain/benefit";
import type { RaffleList } from "@/features/benefit/domain/raffle";
import { creatorRaffleHref, creatorRafflesHref, creatorRaffleVerificationHref } from "@/features/benefit/domain/raffle-navigation";
import { dukjilText } from "@/features/dukjil/ui/dukjil-copy";
import { groupBenefitsCopy } from "@/features/groups/ui/group-benefits-copy";
import { groupsCopy } from "@/features/groups/ui/copy";
import { raffleAllowance, stanFavorite, useStanRaffles, type RaffleAllowance } from "@/features/groups/ui/stan-lucky-cheer";
import { useGroupResource } from "@/features/groups/ui/use-group-resource";
import { FavoritePickMenu } from "@/features/selected-bias/ui/selected-bias-chip";
import type { SelectedBias } from "@/features/selected-bias/ui/use-selected-bias";
import { toContentLocale, type AppLocale } from "@/i18n/locales";
import { walletSchema } from "@/server/group-wallet/domain";
import { LuckyMachine } from "./lucky-machine";
import styles from "./lucky-draw-module.module.css";

type Raffle = RaffleList["raffles"][number];
type Item = { raffle: Raffle; status: Raffle["status"] };
/** The module's three states (plan-ux r5.1 4-E): an upcoming draw or none yet is 준비 중, an open one 응모 가능, else the latest closed one 마감. */
export type LuckyState = "preparing" | "open" | "closed";
const parseWallet = (value: unknown) => walletSchema.parse(value);
const parseEntries = (value: unknown) => benefitListResponseSchema.parse(value);
const t = (locale: AppLocale, key: Parameters<typeof dukjilText>[1], values?: unknown[]) => dukjilText(locale, key, values);

/** Schedule dates (DESIGN §4 날짜): `11. 15. 18:00` in Seoul time; other languages use their own month-day order with the same parts. */
export function luckyDate(value: string, locale: AppLocale) {
  return new Date(value).toLocaleString(locale, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Seoul" });
}

/** Which draw the module shows and in which state; `past` is the newest closed draw other than the shown one (the 지난 럭키드로우 row). */
export function luckyDrawView(items: readonly Item[]): { state: LuckyState; current: Item | null; past: Item | null } {
  const current = items.find(item => item.status === "open") ?? items.find(item => item.status === "preparing") ?? items.find(item => item.status === "closed") ?? null;
  const state: LuckyState = current?.status === "open" ? "open" : current?.status === "closed" ? "closed" : "preparing";
  return { state, current, past: items.find(item => item.status === "closed" && item !== current) ?? null };
}

/** True while the favorite has a draw open for entries: the screen's primary action is then 응모하기 and the wallet's 교환 steps back (8장 plan ③). */
export function useLuckyOpen(locale: AppLocale, slug: string | null) {
  return luckyDrawView(useStanRaffles(locale, slug).items).state === "open";
}

type Cell = { key: string; label: string; value: ReactNode };

/** 럭키드로우 모듈 (G4, R20): one stage graphic, one row of three label-values, one action, then the 지난 럭키드로우 row.
 * Guests see the graphic and locked values with no action; a viewer without a favorite gets the pick row. Still frame only (idle loop is 2단계). */
export function LuckyDrawModule({ locale, bias, guest, onExchange }: { locale: AppLocale; bias: SelectedBias; guest: boolean; onExchange?: () => void }) {
  const favorite = guest ? null : stanFavorite(bias), slug = favorite?.slug ?? null, title = groupBenefitsCopy(locale).lucky;
  const raffles = useStanRaffles(locale, slug);
  const wallet = useGroupResource(!guest && slug ? "/api/me/wallet" : null, parseWallet);
  const entries = useGroupResource(!guest && slug ? `/api/benefits?celebrity=${encodeURIComponent(slug)}&locale=${toContentLocale(locale)}` : null, parseEntries);
  const { state, current, past } = luckyDrawView(raffles.items);
  const raffle = current?.raffle ?? null;
  const entry = raffle && entries.data ? entries.data.benefits.find(item => item.id === raffle.benefitId)?.entry ?? null : undefined;
  const allowance: RaffleAllowance | null = raffle && state === "open" ? raffleAllowance({ raffle, guest, hasPassport: bias.selected?.slug === slug, tickets: { loading: wallet.loading, value: wallet.data?.tickets }, entries: { loading: entries.loading, error: entries.error, entry } }) : null;
  const loading = !guest && (bias.status === "loading" || Boolean(slug && raffles.loading));
  const count = (value: number) => t(locale, "walletTicketsValue", [value.toLocaleString(locale)]);
  const people = (value: number) => t(locale, "luckyPeople", [value.toLocaleString(locale)]);
  const pending = <FanSkeleton width={48} height={20} />, locked = <FanLockedValue locale={locale} />;
  const tickets = guest ? locked : wallet.data ? count(wallet.data.tickets) : wallet.loading ? pending : null;

  const cells: Cell[] = guest || !raffle
    ? [{ key: "available", label: t(locale, "luckyLabelAvailable"), value: guest ? locked : slug ? tickets : count(0) }, { key: "starts", label: t(locale, "luckyLabelStarts"), value: guest ? locked : t(locale, "luckyNextWeek") }]
    : state === "open" ? [
      { key: "available", label: t(locale, "luckyLabelAvailable"), value: allowance?.kind === "count" ? count(allowance.count) : allowance?.kind === "loading" ? pending : tickets },
      { key: "closes", label: t(locale, "luckyLabelCloses"), value: raffle.entryClosesAt ? <time dateTime={raffle.entryClosesAt}>{luckyDate(raffle.entryClosesAt, locale)}</time> : null },
      { key: "winners", label: t(locale, "luckyLabelWinners"), value: people(raffle.winnerQuantity) },
    ] : state === "closed" ? [
      { key: "mine", label: t(locale, "luckyLabelMine"), value: entry === undefined ? (entries.loading ? pending : null) : count(entry?.enteredTickets ?? 0) },
      { key: "results", label: t(locale, "luckyLabelResults"), value: raffle.resultsPublishedAt ? <time dateTime={raffle.resultsPublishedAt}>{luckyDate(raffle.resultsPublishedAt, locale)}</time> : raffle.entryClosesAt ? <time dateTime={raffle.entryClosesAt}>{luckyDate(raffle.entryClosesAt, locale)}</time> : null },
      { key: "winners", label: t(locale, "luckyLabelWinners"), value: people(raffle.winnerQuantity) },
    ] : [
      { key: "available", label: t(locale, "luckyLabelAvailable"), value: tickets },
      { key: "starts", label: t(locale, "luckyLabelStarts"), value: raffle.entryOpensAt ? <time dateTime={raffle.entryOpensAt}>{luckyDate(raffle.entryOpensAt, locale)}</time> : t(locale, "luckyNextWeek") },
      { key: "winners", label: t(locale, "luckyLabelWinners"), value: people(raffle.winnerQuantity) },
    ];

  // One action, described first and drawn once (one emphasised button per screen state, plan ③④).
  type ActionSpec = { label: string; variant: "primary" | "secondary"; href?: string; onClick?: () => void; disabled?: boolean };
  const spec: ActionSpec | null = guest || !slug || loading || raffles.error ? null
    : state === "open" && raffle ? (allowance?.kind === "passport" ? { label: t(locale, "luckyGetPassport"), variant: "primary", href: String(creatorRaffleVerificationHref(slug, locale, raffle.benefitId)) }
      // No ticket to enter with: the button stays active and opens the exchange (plan ③ "누르면 교환 안내").
      : onExchange && allowance?.kind === "count" && allowance.count === 0 && wallet.data?.tickets === 0 ? { label: t(locale, "luckyEnterShort"), variant: "primary", onClick: onExchange }
      : { label: t(locale, "luckyEnterShort"), variant: "primary", href: raffle.benefitId ? String(creatorRaffleHref(slug, raffle.benefitId, locale)) : String(creatorRafflesHref(slug, locale)) })
    : state === "closed" && raffle ? { label: t(locale, "luckyResults"), variant: "secondary", href: raffle.benefitId ? String(creatorRaffleHref(slug, raffle.benefitId, locale)) : String(creatorRafflesHref(slug, locale)) }
    // 준비 중: the one disabled action the plan allows here (8장 plan ④); its reason is the label.
    : { label: raffle?.entryOpensAt ? t(locale, "luckyStartsOn", [luckyDate(raffle.entryOpensAt, locale)]) : t(locale, "luckyStartsNextWeek"), variant: "primary", disabled: true };
  const action = !spec ? null : spec.href ? <FanAction variant={spec.variant} fullWidth href={spec.href} className={styles.action}>{spec.label}</FanAction>
    : <FanAction variant={spec.variant} fullWidth onClick={spec.onClick ?? (() => undefined)} disabled={spec.disabled} className={styles.action}>{spec.label}</FanAction>;

  const pick = !guest && !loading && !slug ? (bias.options.length
    ? <FavoritePickMenu locale={locale} bias={bias} className={styles.pickRow}><FanIcon icon={Plus} size={20} /><span>{t(locale, "heartPick")}</span><FanIcon icon={ChevronRight} size={16} /></FavoritePickMenu>
    : <Link className={styles.pickRow} href={`/pages/groups?locale=${locale}` as Route} data-row="menu"><FanIcon icon={Plus} size={20} /><span>{t(locale, "heartPick")}</span><FanIcon icon={ChevronRight} size={16} /></Link>) : null;

  const pastRow = slug && past ? <Link className={styles.pastRow} href={creatorRafflesHref(slug, locale)} data-row="notice">
    <span className={styles.pastCopy}><strong>{t(locale, "luckyPast")}</strong><span data-meta="">{t(locale, "luckyPastMeta", [past.raffle.title, past.raffle.winnerQuantity.toLocaleString(locale), past.raffle.resultsPublishedAt ? luckyDate(past.raffle.resultsPublishedAt, locale) : past.raffle.entryClosesAt ? luckyDate(past.raffle.entryClosesAt, locale) : ""])}</span></span>
    <FanIcon icon={ChevronRight} size={16} />
  </Link> : null;

  return <section className={styles.section} id="stan-lucky" tabIndex={-1} aria-labelledby="stan-lucky-title" data-block="lucky">
    <div className={styles.head}><FanHeading id="stan-lucky-title">{title}</FanHeading></div>
    <div className={styles.card} data-lucky-module="" data-lucky-state={guest ? "guest" : !slug && !loading ? "pick" : state} data-motion="still">
      <div className={styles.stage}><LuckyMachine closed={state === "closed" && Boolean(raffle)} /></div>
      {raffle && !guest ? <p className={styles.prize} data-raffle-title="">{raffle.title}</p> : null}
      {pick ? pick
        : raffles.error ? <div className={styles.error} role="alert"><span>{t(locale, "luckyLoadError")}</span><FanAction variant="text" onClick={raffles.retry}>{groupsCopy(locale).retry}</FanAction></div>
        : <dl className={styles.values} data-row="label-value" data-cells={loading ? 3 : cells.length}>
          {loading ? [0, 1, 2].map(index => <div key={index}><dt><FanSkeleton width={40} height={12} /></dt><dd>{pending}</dd></div>)
            : cells.map(cell => <div key={cell.key} data-cell={cell.key}><dt>{cell.label}</dt><dd>{cell.value}</dd></div>)}
        </dl>}
      {action ? <div className={styles.actionRow}>{action}</div> : null}
      {pastRow}
    </div>
  </section>;
}
