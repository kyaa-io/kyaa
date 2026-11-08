"use client";
import Link from "next/link";
import type { Route } from "next";
import { ChevronRight, Heart, Plus } from "@/components/fan-ui/stan-icons";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { useEffect, useState } from "react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanLockedValue } from "@/components/fan-ui/fan-locked-value";
import { FanNumber } from "@/components/fan-ui/fan-number";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { fanLoginHref } from "@/components/login-href";
import { raffleListSchema, raffleStatus, type RaffleList } from "@/features/benefit/domain/raffle";
import type { BenefitEntryState } from "@/features/benefit/domain/benefit-entry";
import { dukjilText } from "@/features/dukjil/ui/dukjil-copy";
import { RankDelta } from "@/features/rankings/ui/rank-delta";
import { homeCreatorRankingSchema, type HomeCreatorRankingRow } from "@/features/rankings/domain/types";
import { FavoritePickMenu } from "@/features/selected-bias/ui/selected-bias-chip";
import type { SelectedBias } from "@/features/selected-bias/ui/use-selected-bias";
import { toContentLocale, type AppLocale } from "@/i18n/locales";
import { useGroupResource } from "./use-group-resource";
import styles from "./stan-lucky-cheer.module.css";

type Raffle = RaffleList["raffles"][number];
/** Tickets one entry takes (user decision 2026-11-08: set per lucky draw, 1 by default; the raffle read has no per-draw cost yet). */
export const RAFFLE_TICKET_COST = 1;
/** Stamps that fill a passport page; a full page is one heart (user decision: 9 = 1). */
export const STAMPS_PER_HEART = 9;
const parseRaffles = (value: unknown) => raffleListSchema.parse(value);
const parseCreators = (value: unknown) => homeCreatorRankingSchema.parse(value);
const t = (locale: AppLocale, key: Parameters<typeof dukjilText>[1], values?: unknown[]) => dukjilText(locale, key, values);
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
/** `comparable`: the home ranking has a previous day to compare with. Without it the rank change is not drawn (same rule as the home card). */
export function useStanRank(locale: AppLocale, slug: string | null): { loading: boolean; row: HomeCreatorRankingRow | null; comparable: boolean } {
  const resource = useGroupResource(slug ? `/api/rankings/home?kind=creators&locale=${locale}` : null, parseCreators);
  return { loading: resource.loading, row: resource.data?.rows.find(row => row.slug === slug) ?? null, comparable: resource.data?.comparable === true };
}

/** What an open draw can promise, with the server's entry conditions (enter_owned_benefit_v2): an active fulfillment policy,
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

/** 최애 응원 (E4, r5.1 3.2): who I cheer for, then two label-value rows (내 하트, 순위 with the count basis), then 팬 순위 보기.
 * Cheering spends nothing (user decision): my hearts already count toward the favorite's rank. Without a favorite the card is the pick row only; guests see the locks. */
export function StanCheer({ locale, bias, guest, hearts }: { locale: AppLocale; bias: SelectedBias; guest: boolean; hearts: number | null }) {
  const favorite = guest ? null : stanFavorite(bias), slug = favorite?.slug ?? null, title = t(locale, "stanFlowCheer");
  const rank = useStanRank(locale, slug), selected = bias.selected && bias.selected.slug === slug ? bias.selected : null;
  const login = fanLoginHref(locale, `/benefits?locale=${locale}`);
  const heading = <div className={styles.head}><FanHeading id="stan-cheer-title">{title}</FanHeading></div>;
  const pickInner = <><FanIcon icon={Plus} size={20} /><span className={styles.pickLabel}>{t(locale, "heartPick")}</span><FanIcon icon={ChevronRight} size={16} /></>;
  if (!guest && bias.status !== "loading" && !favorite) return <section className={styles.section} id="stan-cheer" tabIndex={-1} aria-labelledby="stan-cheer-title" data-block="aside-card">
    {heading}
    <div className={styles.card} data-cheer="pick">{bias.options.length ? <FavoritePickMenu locale={locale} bias={bias} className={styles.pick}>{pickInner}</FavoritePickMenu> : <Link className={styles.pick} href={`/pages/groups?locale=${locale}` as Route} data-row="menu">{pickInner}</Link>}</div>
  </section>;
  const who = bias.status === "loading" ? <span className={styles.who}><FanSkeleton shape="circle" width={40} height={40} /><FanSkeleton width={120} height={20} /></span>
    : guest || !favorite ? <span className={styles.who}><span className={styles.avatarEmpty} aria-hidden="true" /><span className={styles.whoText}><FanLockedValue locale={locale} /></span></span>
    : <Link className={styles.who} href={`/${encodeURIComponent(favorite.slug)}?locale=${locale}` as Route}>
      {selected ? <img className={styles.avatar} src={selected.image} alt="" width={40} height={40} style={selected.imagePosition ? { objectPosition: selected.imagePosition } : undefined} /> : <span className={styles.avatarEmpty} aria-hidden="true" />}
      <span className={styles.whoText}><span className={styles.name}>{favorite.name}</span><span className={styles.role}>{t(locale, "cheerCreator")}</span></span>
    </Link>;
  const heart = <FanIcon icon={Heart} size={16} className={styles.heart} />;
  const rankValue = guest ? <FanLockedValue locale={locale} /> : rank.loading || bias.status === "loading" ? <FanSkeleton width={56} height={20} />
    : rank.row ? <>{t(locale, "cheerRankValue", [rank.row.rank.toLocaleString(locale)])}{rank.comparable ? <RankDelta delta={rank.row.delta} locale={locale} /> : null}</> : t(locale, "cheerRankOutShort");
  return <section className={styles.section} id="stan-cheer" tabIndex={-1} aria-labelledby="stan-cheer-title" data-block="aside-card">
    {heading}
    <div className={styles.card} data-cheer={guest ? "guest" : "favorite"}>
      {who}
      <dl className={styles.rows}>
        <div className={styles.row} data-row="label-value"><dt><span className={styles.rowLabel}>{t(locale, "cheerMyHearts")}</span></dt><dd className={styles.rowValue}>{guest ? <FanLockedValue locale={locale} /> : hearts === null ? <FanSkeleton width={48} height={20} /> : <FanNumber value={hearts} size="md" countUp locale={locale} icon={heart} />}</dd></div>
        <div className={styles.row} data-row="label-value"><dt><span className={styles.rowLabel}>{t(locale, "cheerRankLabel")}</span><span className={styles.rowMeta} data-ranking-basis="" data-meta="">{t(locale, "cheerRankBasis")}</span></dt><dd className={styles.rowValue}>{rankValue}</dd></div>
      </dl>
      <FanAction variant="secondary" fullWidth className={styles.action} href={guest ? login : `/${encodeURIComponent(slug ?? "")}?tab=fans&locale=${locale}`}>{guest ? t(locale, "heartPick") : t(locale, "cheerFanRanking")}</FanAction>
    </div>
  </section>;
}
