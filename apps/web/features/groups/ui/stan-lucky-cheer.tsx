"use client";
import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, Heart } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanCount } from "@/components/fan-ui/fan-count-chip";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanLockedValue } from "@/components/fan-ui/fan-locked-value";
import { FanNumber } from "@/components/fan-ui/fan-number";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { FanState } from "@/components/fan-ui/fan-state";
import { fanLoginHref } from "@/components/login-href";
import { raffleListSchema, raffleStatus, type RaffleList } from "@/features/benefit/domain/raffle";
import { benefitListResponseSchema } from "@/features/benefit/domain/benefit";
import { creatorRaffleHref, creatorRafflesHref, creatorRaffleVerificationHref } from "@/features/benefit/domain/raffle-navigation";
import type { BenefitEntryState } from "@/features/benefit/domain/benefit-entry";
import { deliveryLabel } from "@/features/benefit/ui/creator-raffles-screen";
import { dukjilText } from "@/features/dukjil/ui/dukjil-copy";
import { RankDelta } from "@/features/rankings/ui/rank-delta";
import { rankingsText } from "@/features/rankings/ui/rankings-copy";
import { homeCreatorRankingSchema, type HomeCreatorRankingRow } from "@/features/rankings/domain/types";
import { FavoritePickMenu } from "@/features/selected-bias/ui/selected-bias-chip";
import type { SelectedBias } from "@/features/selected-bias/ui/use-selected-bias";
import { toContentLocale, type AppLocale } from "@/i18n/locales";
import { walletSchema } from "@/server/group-wallet/domain";
import { groupBenefitsCopy } from "./group-benefits-copy";
import { seeAllLabel } from "./group-directory";
import { groupsCopy } from "./copy";
import { useGroupResource } from "./use-group-resource";
import styles from "./stan-lucky-cheer.module.css";

type Raffle = RaffleList["raffles"][number];
/** Tickets one entry takes (user decision 2026-11-08: set per lucky draw, 1 by default; the raffle read has no per-draw cost yet). */
export const RAFFLE_TICKET_COST = 1;
/** Stamps that fill a passport page; a full page is one heart (user decision: 9 = 1). */
export const STAMPS_PER_HEART = 9;
const LUCKY_CARDS = 2;
const parseRaffles = (value: unknown) => raffleListSchema.parse(value);
const parseCreators = (value: unknown) => homeCreatorRankingSchema.parse(value);
const parseWallet = (value: unknown) => walletSchema.parse(value);
const parseEntries = (value: unknown) => benefitListResponseSchema.parse(value);
const t = (locale: AppLocale, key: Parameters<typeof dukjilText>[1], values?: unknown[]) => dukjilText(locale, key, values);
const shortDate = (value: string, locale: AppLocale) => new Date(value).toLocaleString(locale, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Seoul" });
const statusOrder = { open: 0, preparing: 1, closed: 2, cancelled: 3 } as const;

/** The stamp gauge's words (E4): 9 − (n mod 9) stamps to the next heart; a full page (n a positive multiple of 9) reads 하트 +1. */
export function nextHeartLabel(locale: AppLocale, stamps: number) {
  return stamps > 0 && stamps % STAMPS_PER_HEART === 0 ? t(locale, "cheerHeartReady") : t(locale, "cheerNextHeart", [STAMPS_PER_HEART - (stamps % STAMPS_PER_HEART)]);
}

/** The favorite whose lucky draws and rank the 덕질 tab shows: the one chosen in the header, else the followed one. */
export function stanFavorite(bias: SelectedBias) {
  return bias.selected ?? bias.unverified ?? null;
}

/** Lucky draws of the favorite, open first, then upcoming, then the latest closed; cancelled ones are left out. */
export function useStanRaffles(locale: AppLocale, slug: string | null) {
  const resource = useGroupResource(slug ? `/api/celebrities/${encodeURIComponent(slug)}/raffles?locale=${toContentLocale(locale)}` : null, parseRaffles);
  const [now, setNow] = useState(() => Date.now());
  // Re-read the status when a draw opens or closes while the screen stays open (at most a minute late).
  useEffect(() => {
    const next = (resource.data?.raffles ?? []).flatMap(raffle => [raffle.entryOpensAt, raffle.entryClosesAt]).filter((date): date is string => Boolean(date)).map(date => Date.parse(date)).filter(time => time > now);
    const timer = setTimeout(() => setNow(Date.now()), Math.max(1000, Math.min(60_000, ...next.map(time => time - now))));
    return () => clearTimeout(timer);
  }, [now, resource.data]);
  const items = (resource.data?.raffles ?? []).map(raffle => ({ raffle, status: raffleStatus(raffle, now) })).filter(item => item.status !== "cancelled")
    .sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || (a.status === "closed" ? -1 : 1) * (Date.parse(a.raffle.entryClosesAt ?? "") - Date.parse(b.raffle.entryClosesAt ?? "") || 0));
  return { ...resource, items, live: items.filter(item => item.status === "open" || item.status === "preparing").length };
}

/** The favorite's row in the public creator ranking (top 20); null when the read is done and the favorite is not in it. */
export function useStanRank(locale: AppLocale, slug: string | null): { loading: boolean; row: HomeCreatorRankingRow | null } {
  const resource = useGroupResource(slug ? `/api/rankings/home?kind=creators&locale=${locale}` : null, parseCreators);
  return { loading: resource.loading, row: resource.data?.rows.find(row => row.slug === slug) ?? null };
}

function RaffleDate({ raffle, status, locale }: { raffle: Raffle; status: Raffle["status"]; locale: AppLocale }) {
  if (status === "preparing" && raffle.entryOpensAt) return <time dateTime={raffle.entryOpensAt}>{t(locale, "luckyOpensAt", [shortDate(raffle.entryOpensAt, locale)])}</time>;
  if (status === "open" && raffle.entryClosesAt) return <time dateTime={raffle.entryClosesAt}>{t(locale, "luckyClosesAt", [shortDate(raffle.entryClosesAt, locale)])}</time>;
  if (status === "closed" && raffle.resultsPublishedAt) return <time dateTime={raffle.resultsPublishedAt}>{t(locale, "luckyResultsAt", [shortDate(raffle.resultsPublishedAt, locale)])}</time>;
  if (status === "closed") return <span>{raffle.entryClosesAt ? t(locale, "luckyClosesAt", [shortDate(raffle.entryClosesAt, locale)]) : t(locale, "luckyClosed")}</span>;
  return null;
}

/** What the card can promise for an open draw, with the server's entry conditions (enter_owned_benefit_v2): an active fulfillment policy,
 * the creator's passport for a standalone draw, the wallet tickets and the remaining per-fan limit. Unknown while a read is pending or failed. */
export type RaffleAllowance = { kind: "count"; count: number } | { kind: "loading" } | { kind: "unknown" } | { kind: "locked" } | { kind: "passport" } | { kind: "policy" };
export function raffleAllowance({ raffle, guest, hasPassport, tickets, entries }: {
  raffle: Raffle; guest: boolean; hasPassport: boolean;
  tickets: { loading: boolean; value: number | undefined };
  entries: { loading: boolean; error: boolean; entry: BenefitEntryState | null | undefined };
}): RaffleAllowance {
  if (guest) return { kind: "locked" };
  if (!raffle.fulfillmentPolicy) return { kind: "policy" };
  if (raffle.requiresFanVerification && (!hasPassport || entries.entry?.fanVerified === false)) return { kind: "passport" };
  if (tickets.loading || entries.loading) return { kind: "loading" };
  if (tickets.value === undefined || entries.error || entries.entry === undefined) return { kind: "unknown" };
  const remaining = entries.entry ? entries.entry.remainingBenefitTickets : raffle.perFanTicketLimit;
  return { kind: "count", count: Math.max(0, Math.min(Math.floor(tickets.value / RAFFLE_TICKET_COST), remaining ?? Number.POSITIVE_INFINITY)) };
}

function raffleHref(slug: string, benefitId: string | null, locale: AppLocale): string {
  if (benefitId) return creatorRaffleHref(slug, benefitId, locale);
  return creatorRafflesHref(slug, locale);
}

/** One lucky-draw card (E4): prize, date, winners, ticket cost with the entries the server would take now, and one action that always works.
 * When the server would refuse (no passport, no fulfillment policy yet) the card says why and leads to the fix instead of a count. */
function RaffleCard({ raffle, status, slug, locale, entered, allowance }: { raffle: Raffle; status: Raffle["status"]; slug: string; locale: AppLocale; entered: number | null; allowance: RaffleAllowance | null }) {
  const open = status === "open" && allowance !== null;
  const cost = !open ? null
    : allowance.kind === "locked" ? <>{t(locale, "luckyCostGuest", [RAFFLE_TICKET_COST])} · <FanLockedValue locale={locale} /></>
    : allowance.kind === "loading" ? <FanSkeleton width={160} height={20} />
    : allowance.kind === "count" ? t(locale, "luckyCost", [RAFFLE_TICKET_COST, allowance.count.toLocaleString(locale)])
    : allowance.kind === "passport" ? t(locale, "luckyNeedPassport")
    : allowance.kind === "policy" ? t(locale, "luckyNeedPolicy")
    : t(locale, "luckyCostGuest", [RAFFLE_TICKET_COST]);
  const passport = open && allowance.kind === "passport";
  const href = passport ? creatorRaffleVerificationHref(slug, locale, raffle.benefitId) : raffleHref(slug, raffle.benefitId, locale);
  const label = passport ? t(locale, "luckyGetPassport") : status === "open" && allowance?.kind !== "policy" ? t(locale, "luckyEnter") : status === "closed" ? t(locale, "luckyResults") : t(locale, "luckyDetails");
  return <li className={styles.raffle} data-raffle-status={status} data-raffle-allowance={open ? allowance.kind : undefined}>
    <span className={styles.prize}>{raffle.imageUrl ? <img src={raffle.imageUrl} alt="" width={80} height={60} loading="lazy" /> : <img src="/images/economy/ticket.svg" alt="" width={32} height={32} data-fallback="" />}</span>
    <span className={styles.raffleHead}><strong className={styles.raffleTitle}>{raffle.title}</strong><span className={styles.meta}><RaffleDate raffle={raffle} status={status} locale={locale} /></span></span>
    <span className={styles.facts}>
      <span className={styles.meta}>{t(locale, "luckyWinners", [raffle.winnerQuantity.toLocaleString(locale)])} · {deliveryLabel(raffle, locale)}{entered ? <> · {t(locale, "luckyMyEntries", [entered.toLocaleString(locale)])}</> : null}</span>
      {cost ? <span className={styles.cost} data-raffle-cost="">{cost}</span> : null}
    </span>
    <FanAction variant="secondary" size="sm" fullWidth href={href} trailingIcon={<ArrowRight />} className={styles.action}>{label}</FanAction>
  </li>;
}

/** 럭키드로우 (E4): the favorite's real lucky draws instead of placeholder cards. No disabled action; an upcoming draw opens its gift page. */
export function StanLucky({ locale, bias, guest }: { locale: AppLocale; bias: SelectedBias; guest: boolean }) {
  const favorite = guest ? null : stanFavorite(bias), slug = favorite?.slug ?? null;
  const raffles = useStanRaffles(locale, slug), title = groupBenefitsCopy(locale).lucky;
  const wallet = useGroupResource(!guest && slug ? "/api/me/wallet" : null, parseWallet);
  const entries = useGroupResource(!guest && slug ? `/api/benefits?celebrity=${encodeURIComponent(slug)}&locale=${toContentLocale(locale)}` : null, parseEntries);
  const shown = raffles.items.slice(0, LUCKY_CARDS);
  const more = slug && raffles.items.length > LUCKY_CARDS ? <Link className={styles.headLink} href={creatorRafflesHref(slug, locale)}>{seeAllLabel[locale]}<ArrowRight size={16} aria-hidden="true" /></Link> : null;
  const empty = (title: string, action?: ReactNode) => <FanState inline compact kind="empty" className={styles.empty} title={title} actions={action} />;
  const history = <FanAction variant="text" href={`/my/raffles?locale=${locale}`} trailingIcon={<ArrowRight />}>{t(locale, "luckyHistory")}</FanAction>;
  const body = bias.status === "loading" || (slug && raffles.loading) ? <div className={styles.pending} aria-busy="true"><FanSkeleton shape="block" width="100%" height="100%" /></div>
    : guest ? empty(t(locale, "luckyNoFavorite"))
    : !slug ? empty(t(locale, "luckyNoFavorite"), bias.options.length ? <FavoritePickMenu locale={locale} bias={bias} className={styles.pick}><span>{t(locale, "heartPick")}</span><ArrowRight size={16} aria-hidden="true" /></FavoritePickMenu> : <FanAction variant="text" href={`/pages/groups?locale=${locale}`} trailingIcon={<ArrowRight />}>{t(locale, "heartPick")}</FanAction>)
    : raffles.error ? <FanState inline compact kind="error" className={styles.empty} title={t(locale, "luckyLoadError")} actions={<FanAction variant="text" onClick={raffles.retry}>{groupsCopy(locale).retry}</FanAction>} />
    : shown.length === 0 ? empty(t(locale, "luckyEmpty"), history)
    : <ul className={styles.raffles} data-count={shown.length}>{shown.map(({ raffle, status }) => {
      // A loaded list without this benefit means no entry yet (entered 0); undefined while the list is not known.
      const entry = entries.data ? entries.data.benefits.find(item => item.id === raffle.benefitId)?.entry ?? null : undefined;
      const allowance = status === "open" ? raffleAllowance({ raffle, guest, hasPassport: bias.selected?.slug === slug, tickets: { loading: wallet.loading, value: wallet.data?.tickets }, entries: { loading: entries.loading, error: entries.error, entry } }) : null;
      return <RaffleCard key={raffle.id} raffle={raffle} status={status} slug={slug} locale={locale} entered={entry?.enteredTickets ?? null} allowance={allowance} />;
    })}</ul>;
  return <section className={styles.section} id="stan-lucky" tabIndex={-1} aria-labelledby="stan-lucky-title">
    <div className={styles.head}><FanHeading id="stan-lucky-title">{title}</FanHeading><FanCount value={raffles.live} />{more}</div>
    {body}
  </section>;
}

/** 최애 응원 (E4, user decision: cheering spends nothing): my hearts already count toward the favorite's rank, so the card shows that rank,
 * my share and the way to the fan ranking. No send button. F2: the stamps to the next heart live in the wallet's stamp cell only (one value, one shape). */
export function StanCheer({ locale, bias, guest, hearts }: { locale: AppLocale; bias: SelectedBias; guest: boolean; hearts: number | null }) {
  const favorite = guest ? null : stanFavorite(bias), slug = favorite?.slug ?? null, title = t(locale, "stanFlowCheer");
  const rank = useStanRank(locale, slug), selected = bias.selected && bias.selected.slug === slug ? bias.selected : null;
  const login = fanLoginHref(locale, `/benefits?locale=${locale}`);
  const pickInner = <><span className={styles.avatarIcon}><Heart size={20} aria-hidden="true" /></span><span className={styles.name}>{t(locale, "heartPick")}</span><ArrowRight size={16} aria-hidden="true" /></>;
  const head = bias.status === "loading" ? <span className={styles.who}><FanSkeleton shape="circle" width={40} height={40} /><FanSkeleton width={120} height={20} /></span>
    : guest ? <span className={styles.who}><span className={styles.avatarIcon}><Heart size={20} aria-hidden="true" /></span><span className={styles.whoText}><FanLockedValue locale={locale} /></span></span>
    : !favorite ? (bias.options.length ? <FavoritePickMenu locale={locale} bias={bias} className={styles.who}>{pickInner}</FavoritePickMenu> : <Link className={styles.who} href={`/pages/groups?locale=${locale}` as Route}>{pickInner}</Link>)
    : <Link className={styles.who} href={`/${encodeURIComponent(favorite.slug)}?locale=${locale}` as Route}>
      {selected ? <img className={styles.avatar} src={selected.image} alt="" width={40} height={40} style={selected.imagePosition ? { objectPosition: selected.imagePosition } : undefined} /> : <span className={styles.avatarIcon}><Heart size={20} aria-hidden="true" /></span>}
      <span className={styles.whoText}><span className={styles.name}>{favorite.name}</span>
        <span className={styles.rank}>{rank.loading ? <FanSkeleton width={120} height={16} /> : rank.row ? <>{t(locale, "cheerRank", [rank.row.rank])}<RankDelta delta={rank.row.delta} locale={locale} /></> : t(locale, "cheerRankOut")}</span></span>
    </Link>;
  const heartIcon = <Heart size={20} strokeWidth={1.75} className={styles.heart} aria-hidden="true" />;
  return <section className={styles.section} id="stan-cheer" tabIndex={-1} aria-labelledby="stan-cheer-title">
    <div className={styles.head}><FanHeading id="stan-cheer-title">{title}</FanHeading></div>
    <div className={styles.cheer} data-cheer={guest ? "guest" : favorite ? "favorite" : "pick"}>
      {head}
      <dl className={styles.numbers}>
        <div><dt>{t(locale, "cheerMyHearts")}</dt><dd>{guest ? <FanLockedValue locale={locale} /> : hearts === null ? <FanSkeleton width={48} height={24} /> : <FanNumber value={hearts} size="lg" countUp locale={locale} icon={heartIcon} />}</dd></div>
        {rank.row ? <div><dt>{rankingsText(locale, "rkCumulativeFans")} · {rankingsText(locale, "rkCumulativeHearts")}</dt><dd className={styles.community}>{rank.row.score.toLocaleString(locale)} · {heartIcon}{rank.row.hearts.toLocaleString(locale)}</dd></div> : null}
      </dl>
      <FanAction variant="secondary" size="sm" fullWidth className={styles.action} trailingIcon={<ArrowRight />} href={guest ? login : slug ? `/${encodeURIComponent(slug)}?tab=fans&locale=${locale}` : `/pages/groups?locale=${locale}`}>{guest || !slug ? t(locale, "heartPick") : t(locale, "cheerFanRanking")}</FanAction>
    </div>
  </section>;
}
