"use client";
import type { Route } from "next";
import Link from "next/link";
import { Fragment, useEffect, useLayoutEffect, useRef, type ReactNode } from "react";

import { CreatorAvatar } from "@/components/fan-ui/creator-avatar";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanNumber } from "@/components/fan-ui/fan-number";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { FanState } from "@/components/fan-ui/fan-state";
import { FanTabs } from "@/components/fan-ui/fan-tabs";
import { FanTag } from "@/components/fan-ui/fan-tag";
import { fanLoginHref } from "@/components/login-href";
import { levelLabel } from "@/features/passport/domain/passport-read-model";
import { Avatar } from "@/features/profile/ui/avatar";
import { FanTierBadge } from "@/features/rewards/ui/fan-tier-badge";
import type { AppLocale } from "@/i18n/locales";
import {
  HOME_CREATOR_METRICS, HOME_FAN_METRICS,
  type HomeCreatorMetric, type HomeCreatorRanking, type HomeCreatorRankingRow, type HomeFanMetric, type HomeFanRanking, type HomeFanRankingRow,
} from "../domain/types";
import { fanAvatar } from "./rankings-content";
import { rankingsText } from "./rankings-copy";
import { RankDelta } from "./rank-delta";
import { useRankingResource } from "./use-ranking-resource";
import styles from "./ranking-rows.module.css";

/** Rows of the platform rankings, shared by the home card (five rows and placeholders) and /rankings (every row the API gives): rank, picture,
 * name, second line, the metric's value, this week's gain and the movement column (always 36px; 신규 when there is no previous built day). */

export type RankingsTab = "fans" | "creators";
export type RankingMetric = HomeFanMetric | HomeCreatorMetric;
/** The screens open on hearts for both tabs (decision 2026-11-09 15:52); the API keeps its own defaults, so the screens always name the metric. */
export const DEFAULT_METRIC: Record<RankingsTab, RankingMetric> = { fans: "hearts", creators: "hearts" };
/** Segment order: the screens' default first (fans 하트|포인트, creators 하트|찐팬 수). */
const SEGMENTS: Record<RankingsTab, readonly RankingMetric[]> = { fans: ["hearts", "points"], creators: ["hearts", "fans"] };
export function metricFor(tab: RankingsTab, value: unknown): RankingMetric {
  const allowed: readonly string[] = tab === "fans" ? HOME_FAN_METRICS : HOME_CREATOR_METRICS;
  return typeof value === "string" && allowed.includes(value) ? (value as RankingMetric) : DEFAULT_METRIC[tab];
}
export const rankingUrl = (tab: RankingsTab, metric: RankingMetric, locale: AppLocale, limit?: number) =>
  `/api/rankings/home?kind=${tab}&metric=${metric}&locale=${locale}${limit ? `&limit=${limit}` : ""}`;
/** The full ranking with this tab and metric; signed out, the way through sign-in back to it. */
export function rankingsPageHref(locale: AppLocale, tab: RankingsTab, metric: RankingMetric, guest: boolean) {
  const path = `/rankings?locale=${locale}&tab=${tab}&metric=${metric}`;
  return (guest ? fanLoginHref(locale, path) : path) as Route;
}

/** A snapshot is rewritten on read once it is ten minutes old. The next read is due when this one turns ten minutes, measured on the server clock. */
const SNAPSHOT_MS = 10 * 60 * 1000;
const MIN_GAP_MS = 60 * 1000;
const JITTER_MS = 30 * 1000;
export function nextReadDelay(fetchedAt: string | undefined, computedAt: string | null, random = Math.random) {
  const age = fetchedAt && computedAt ? Math.max(0, Date.parse(fetchedAt) - Date.parse(computedAt)) : SNAPSHOT_MS;
  return Math.max(MIN_GAP_MS, SNAPSHOT_MS - (Number.isNaN(age) ? SNAPSHOT_MS : age)) + Math.floor(random() * JITTER_MS);
}

/** Reads the ranking and reads it again, quietly (rows stay on screen), when the snapshot it showed turns ten minutes old: by a timer while the
 * page is visible, or at once when the page comes back after that moment. A failed re-read tries again a minute later. Never more often than once a minute. */
export function useLiveRanking<T extends { computedAt: string | null; fetchedAt?: string }>(url: string, parse: (value: unknown) => T) {
  const { state, retry, refresh } = useRankingResource(url, parse);
  const data = state.status === "ready" ? state.data : null;
  const due = useRef(0);
  useEffect(() => {
    if (!data) return;
    due.current = Date.now() + nextReadDelay(data.fetchedAt, data.computedAt);
    let timer: ReturnType<typeof setTimeout> | undefined;
    // A quiet re-read that fails keeps the rows (the same answer object), so this effect would not run again: the next try is armed here,
    // a minute later. A re-read that succeeds brings a new answer, and the effect starts over from its snapshot.
    const read = () => { due.current = Date.now() + MIN_GAP_MS + Math.floor(Math.random() * JITTER_MS); refresh(); arm(); };
    function arm() {
      clearTimeout(timer);
      if (document.visibilityState !== "visible") return;
      timer = setTimeout(read, Math.max(0, due.current - Date.now()));
    }
    const back = () => { if (document.visibilityState === "visible" && Date.now() >= due.current) read(); else arm(); };
    arm();
    document.addEventListener("visibilitychange", back);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", back); };
  }, [data, refresh]);
  return { state, retry };
}
export type Live<T extends { computedAt: string | null }> = ReturnType<typeof useLiveRanking<T & { fetchedAt?: string }>>;

const MOVE_MS = 240;
const reducedMotion = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
/** A row whose rank changed between two answers of the same metric slides from its old place (transform only, 240ms); its movement mark fades in.
 * Nothing moves on the first answer, on a row whose place did not change, or under reduced motion. A metric change remounts the rows. */
function useRowMotion(order: readonly string[]) {
  const nodes = useRef(new Map<string, HTMLElement>());
  const tops = useRef(new Map<string, number>());
  const signature = order.join("\n");
  useLayoutEffect(() => {
    const before = tops.current;
    const after = new Map<string, number>();
    for (const [key, node] of nodes.current) after.set(key, node.offsetTop);
    tops.current = after;
    if (before.size === 0 || reducedMotion()) return;
    for (const [key, top] of after) {
      const was = before.get(key);
      const node = nodes.current.get(key);
      if (was === undefined || was === top || !node || typeof node.animate !== "function") continue;
      node.animate([{ transform: `translateY(${was - top}px)` }, { transform: "translateY(0)" }], { duration: MOVE_MS, easing: "cubic-bezier(.2, 0, 0, 1)" });
      node.querySelector<HTMLElement>("[data-delta-cell]")?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, delay: MOVE_MS - 160, fill: "backwards" });
    }
  }, [signature]);
  return (key: string) => (node: HTMLElement | null) => { if (node) nodes.current.set(key, node); else nodes.current.delete(key); };
}

/** The snapshot time in the viewer's locale; an older snapshot also keeps its date. */
export function updatedLabel(locale: AppLocale, at: string, now = new Date()) {
  const when = new Date(at);
  if (Number.isNaN(when.getTime())) return null;
  const sameDay = when.toDateString() === now.toDateString();
  const time = when.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
  const text = sameDay ? time : `${when.toLocaleDateString(locale, { month: "numeric", day: "numeric" })} ${time}`;
  return rankingsText(locale, "rkUpdatedAt", [text]);
}

const METRIC_LABEL = { hearts: "rkHeartsTab", points: "rkMetricPoints", fans: "rkCumulativeFans" } as const;
/** Snapshot time on its own top line, followed by the metric segment. */
export function MetricLine({ locale, tab, metric, onChange, computedAt }: { locale: AppLocale; tab: RankingsTab; metric: RankingMetric; onChange: (metric: RankingMetric) => void; computedAt: string | null }) {
  const text = computedAt ? updatedLabel(locale, computedAt) : null;
  return <div className={styles.metricLine} data-metric-line="">
    <FanTabs variant="segment" className={styles.metricTabs} label={rankingsText(locale, "rkMetricLabel")} current={metric}
      items={SEGMENTS[tab].map((key) => ({ key, label: rankingsText(locale, METRIC_LABEL[key]), onSelect: () => onChange(key) }))} />
    {text ? <time className={styles.updated} dateTime={computedAt!}>{text}</time> : null}
  </div>;
}

function Rank({ rank }: { rank: number }) {
  return <span className={styles.rank} data-medal={rank <= 3 ? rank : undefined}>{rank}</span>;
}

/** Rows and the bottom line at the same heights while reading, so the block does not jump when the answer comes. */
export function LoadingRows({ count }: { count: number }) {
  return <ol className={styles.rows}>{Array.from({ length: count }, (_, i) => <li key={i} className={styles.row} data-row="fan-rank-loading" aria-hidden="true">
    <FanSkeleton width={20} height={16} /><FanSkeleton shape="circle" width={40} height={40} />
    <span className={styles.body}><FanSkeleton width="60%" height={14} /><FanSkeleton width="40%" height={12} /></span>
  </li>)}</ol>;
}
export function FailedRows({ locale, retry, rows }: { locale: AppLocale; retry: () => void; rows: number }) {
  return <div className={styles.state} data-rows={rows}><FanState inline compact kind="error" title={rankingsText(locale, "rkError")} actions={<FanAction variant="text" size="sm" onClick={retry}>{rankingsText(locale, "rkRetry")}</FanAction>} /></div>;
}
/** A missing row keeps its rank number, a ring where the picture goes and a dash. With no rows at all the first one says why. */
function Placeholders({ from, to, emptyText }: { from: number; to: number; emptyText: string }) {
  return <>{Array.from({ length: Math.max(0, to - from) }, (_, i) => {
    const note = from === 0 && i === 0;
    return <li key={`p${i}`} className={styles.row} data-row="rank-placeholder" data-placeholder="" aria-hidden={note ? undefined : true}>
      <span className={styles.rank}>{from + i + 1}</span><span className={styles.ghost} />
      <span className={styles.body}><span className={styles.ghostText}>{note ? emptyText : "—"}</span></span>
    </li>;
  })}</>;
}

const heartIcon = (size: number) => <img src="/images/economy/heart.svg" alt="" width={size} height={size} />;

/** Second line: the items that have a value, one dot between them. An item without a value leaves with its dot. */
function Meta({ items }: { items: ReactNode[] }) {
  const shown = items.filter(Boolean);
  return <span className={styles.meta}>{shown.map((item, i) => <Fragment key={i}>{i > 0 ? <span className={styles.dot} aria-hidden="true">·</span> : null}{item}</Fragment>)}</span>;
}

/** The right-hand number of a row: the metric's value, read by name (hearts, points, fans), never from score alone. Counts up only when a later answer changes it. */
function Main({ locale, metric, value }: { locale: AppLocale; metric: RankingMetric; value: number }) {
  const n = value.toLocaleString(locale);
  const label = metric === "hearts" ? rankingsText(locale, "rkHearts", [n]) : metric === "points" ? rankingsText(locale, "rkPointsLabel", [n]) : rankingsText(locale, "rkJjinfanCount", [n]);
  const template = metric === "points" ? rankingsText(locale, "rkPoints", ["\u0000"]) : metric === "fans" ? rankingsText(locale, "rkJjinfanCount", ["\u0000"]) : "\u0000";
  const [before, after] = template.split("\u0000");
  return <span className={styles.main} aria-label={label} data-metric={metric}>
    <span aria-hidden="true" className={styles.mainInner}>
      {metric === "hearts" ? heartIcon(14) : null}{before?.trim() ? <span>{before.trim()}</span> : null}<FanNumber value={value} locale={locale} countUp className={styles.mainNumber} />{after?.trim() ? <span>{after.trim()}</span> : null}
    </span>
  </span>;
}

/** Movement against the previous built day of this metric. A row not ranked then (or the metric's first day) reads 신규. */
function Delta({ locale, delta }: { locale: AppLocale; delta: number | null }) {
  return <span className={styles.deltaCell} data-delta-cell>{delta === null
    ? <FanTag tone="neutral" className={styles.newTag}><span data-direction="new">{rankingsText(locale, "rkDeltaNew")}</span></FanTag>
    : <RankDelta delta={delta} locale={locale} />}</span>;
}

const gain = (locale: AppLocale, value: number | null | undefined) => typeof value === "number" && value > 0 ? `+${value.toLocaleString(locale)}` : null;

/** Home rows share one order; missing history is unknown (—), a measured zero is +0. */
function CompactIdentity({ locale, rank, delta, avatar, name, liveNow, liveLabel, isNew }: { locale: AppLocale; rank: number; delta: number | null; avatar: ReactNode; name: string; liveNow?: boolean; liveLabel: string; isNew?: boolean }) {
  const direction = (delta ?? 0) > 0 ? "up" : (delta ?? 0) < 0 ? "down" : "same";
  const label = direction === "up" ? rankingsText(locale, "rkDeltaUp", [delta]) : direction === "down" ? rankingsText(locale, "rkDeltaDown", [Math.abs(delta!)]) : rankingsText(locale, "rkDeltaSame");
  return <>
    <Rank rank={rank} />
    <span className={styles.compactDelta} data-delta-cell data-direction={direction} role="img" aria-label={label}><span aria-hidden="true">{delta ? `${delta > 0 ? "▲" : "▼"}${Math.abs(delta).toLocaleString(locale)}` : "—"}</span></span>
    {avatar}
    <span className={styles.nameLine}>
      <span className={styles.name} title={name}>{name}</span>
      {liveNow ? <span className={styles.live} role="img" aria-label={liveLabel} title={liveLabel}><span className={styles.liveDot} aria-hidden="true" /></span> : null}
      {isNew ? <span className={styles.compactNew} data-direction="new">{rankingsText(locale, "rkDeltaNew")}</span> : null}
    </span>
  </>;
}
function CompactValues({ locale, fans, hearts, weekGain, fan = false }: { locale: AppLocale; fans: number | null | undefined; hearts: number | undefined; weekGain: number | null | undefined; fan?: boolean }) {
  const full = (n: number | null | undefined) => typeof n === "number" ? n.toLocaleString(locale) : "—";
  const short = (n: number | null | undefined) => typeof n === "number" ? n.toLocaleString(locale, { notation: n >= 1000 ? "compact" : "standard", maximumFractionDigits: 1 }) : "—";
  const gain = typeof weekGain === "number" ? `${weekGain >= 0 ? "+" : "−"}${short(Math.abs(weekGain))}` : "—";
  const gainLabel = typeof weekGain === "number" ? `${weekGain >= 0 ? "+" : "−"}${full(Math.abs(weekGain))}` : "—";
  return <span className={styles.compactValues}>
    <span data-metric="fans" aria-label={rankingsText(locale, fan ? "rkFanJjinfanCount" : "rkJjinfanCount", [full(fans)])} title={rankingsText(locale, fan ? "rkFanJjinfanCount" : "rkJjinfanCount", [full(fans)])}><span aria-hidden="true">{rankingsText(locale, "rkJjinfanShort")} {short(fans)}</span></span>
    <span className={styles.hearts} data-metric="hearts" aria-label={rankingsText(locale, "rkHearts", [full(hearts)])} title={rankingsText(locale, "rkHearts", [full(hearts)])}>{heartIcon(12)}<span aria-hidden="true">{short(hearts)}</span></span>
    <span className={styles.gain} data-tone={typeof weekGain === "number" && weekGain > 0 ? "up" : undefined} data-week-gain="" aria-label={rankingsText(locale, "rkWeekGain", [gainLabel])} title={rankingsText(locale, "rkWeekGain", [gainLabel])}><span aria-hidden="true">{gain}</span></span>
  </span>;
}

const fanValue = (row: HomeFanRankingRow, metric: RankingMetric) => metric === "points" ? row.points ?? row.score : row.hearts ?? row.score;
const fanKey = (row: HomeFanRankingRow, index: number, rows: readonly HomeFanRankingRow[]) =>
  rows.findIndex((other) => other.nickname === row.nickname) === index ? `n:${row.nickname}` : `r:${row.rank}`;

/** Fans: nickname, grade · favorite, the metric's value and this week's gain. `fill` keeps the block at that many rows with placeholders. */
export function FanRows({ locale, ranking, metric, show, fill, scope, compact = false }: { locale: AppLocale; ranking: HomeFanRanking; compact?: boolean; metric: HomeFanMetric; show?: number; fill?: number; scope: string }) {
  const shown = show === undefined ? ranking.rows : ranking.rows.slice(0, show);
  const keys = shown.map((row, i) => fanKey(row, i, shown));
  const place = useRowMotion(keys);
  return <ol className={styles.rows}>{shown.map((row, i) => {
    const plus = gain(locale, row.weekGain);
    if (compact) return <li key={keys[i]} ref={place(keys[i]!)} id={`rank-${scope}-fans-${row.rank}`} className={`${styles.row} ${styles.compactRow}`} data-row="fan-rank" data-kind="fans" data-me={row.isMe || undefined} aria-current={row.isMe || undefined}>
      <CompactIdentity locale={locale} rank={row.rank} delta={row.delta} name={row.nickname} liveNow={row.liveNow} isNew={row.isNew} liveLabel={rankingsText(locale, "rkFavoriteLive", [row.favorite?.name ?? ""])} avatar={<Avatar avatar={fanAvatar(row.characterId)} imageUrl={null} label="" size={24} />} />
      <CompactValues locale={locale} fans={row.fans} hearts={row.hearts ?? (metric === "hearts" ? row.score : undefined)} weekGain={row.weekGain} fan />
    </li>;
    return <li key={keys[i]} ref={place(keys[i]!)} id={`rank-${scope}-fans-${row.rank}`} className={styles.row} data-row="fan-rank" data-kind="fans" data-me={row.isMe || undefined} aria-current={row.isMe || undefined}>
      <Rank rank={row.rank} />
      <Avatar avatar={fanAvatar(row.characterId)} imageUrl={null} label="" size={40} />
      <span className={styles.body}>
        <span className={styles.name}>{row.nickname}</span>
        <Meta items={[
          row.tier ? <span key="tier" className={styles.tier}><FanTierBadge tier={row.tier} locale={locale} size={16} /><span>{levelLabel(locale, row.tier)}</span></span> : null,
          row.favorite ? <span key="fav" className={styles.favorite}>{rankingsText(locale, "rkFavorite", [row.favorite.name])}</span> : null,
        ]} />
      </span>
      <span className={styles.value}>
        <Main locale={locale} metric={metric} value={fanValue(row, metric)} />
        {plus ? <span className={styles.gain} data-tone="up" data-week-gain="" aria-label={rankingsText(locale, "rkWeekGain", [plus])}><span aria-hidden="true">{plus}</span></span> : null}
      </span>
      <Delta locale={locale} delta={row.delta} />
    </li>;
  })}{fill ? <Placeholders from={shown.length} to={fill} emptyText={rankingsText(locale, metric === "points" ? "rkEmpty" : "rkEmptyFans")} /> : null}</ol>;
}

const creatorValue = (row: HomeCreatorRankingRow, metric: RankingMetric) => metric === "fans" ? row.fans ?? row.score : row.hearts;

/** Creators: name (on /rankings with the 찐팬 100 challenge tag), the other metric · this week's gain on the second line, the metric's value. Each row opens the page. */
export function CreatorRows({ locale, ranking, metric, show, fill, scope, challengeTag = false, compact = false }: { locale: AppLocale; ranking: HomeCreatorRanking; compact?: boolean; metric: HomeCreatorMetric; show?: number; fill?: number; scope: string; challengeTag?: boolean }) {
  const shown = show === undefined ? ranking.rows : ranking.rows.slice(0, show);
  const place = useRowMotion(shown.map((row) => row.slug));
  return <ol className={styles.rows}>{shown.map((row) => {
    const plus = gain(locale, row.weekGain);
    const fans = row.fans ?? (metric === "fans" ? row.score : null);
    if (compact) return <li key={row.slug} ref={place(row.slug)} id={`rank-${scope}-creators-${row.rank}`} data-row="creator-rank">
      <Link className={`${styles.row} ${styles.compactRow}`} data-kind="creators" href={`/${row.slug}?locale=${locale}` as Route}>
        <CompactIdentity locale={locale} rank={row.rank} delta={row.delta} name={row.name} liveNow={row.liveNow} isNew={row.isNew} liveLabel={rankingsText(locale, "rkCreatorLive", [row.name])} avatar={<CreatorAvatar slug={row.slug} src={row.imageUrl} size={24} photos={undefined} />} />
        <CompactValues locale={locale} fans={fans} hearts={row.hearts} weekGain={row.weekGain} />
      </Link>
    </li>;
    return <li key={row.slug} ref={place(row.slug)} id={`rank-${scope}-creators-${row.rank}`} data-row="creator-rank">
      <Link className={styles.row} data-kind="creators" href={`/${row.slug}?locale=${locale}` as Route}>
        <Rank rank={row.rank} />
        <CreatorAvatar slug={row.slug} src={row.imageUrl} size={40} photos={undefined} />
        <span className={styles.body}>
          <span className={styles.nameLine}><span className={styles.name}>{row.name}</span>{challengeTag && row.challenge ? <FanTag tone="fan" className={styles.challenge}>{rankingsText(locale, "jjTag")}</FanTag> : null}</span>
          <Meta items={[
            metric === "fans"
              ? <span key="hearts" className={styles.hearts} aria-label={rankingsText(locale, "rkHearts", [row.hearts.toLocaleString(locale)])}>{heartIcon(12)}<span aria-hidden="true">{row.hearts.toLocaleString(locale)}</span></span>
              : fans !== null ? <span key="fans">{rankingsText(locale, "rkJjinfanCount", [fans.toLocaleString(locale)])}</span> : null,
            plus ? <span key="gain" className={styles.gain} data-tone="up">{rankingsText(locale, "rkWeekGain", [plus])}</span> : null,
          ]} />
        </span>
        <Main locale={locale} metric={metric} value={creatorValue(row, metric)} />
        <Delta locale={locale} delta={row.delta} />
      </Link>
    </li>;
  })}{fill ? <Placeholders from={shown.length} to={fill} emptyText={rankingsText(locale, "rkEmpty")} /> : null}</ol>;
}

/** Bottom line, one height on every tab and state: my rank in the chosen metric, the way to sign in, or a link. */
export function Foot({ children }: { children?: ReactNode }) {
  return <div className={styles.foot} data-empty={children ? undefined : ""}>{children}</div>;
}
export function MyRank({ locale, ranking, metric }: { locale: AppLocale; ranking: HomeFanRanking; metric: HomeFanMetric }) {
  const me = ranking.me ?? null;
  const value = me ? (metric === "points" ? me.points ?? me.score : me.hearts ?? me.score) : 0;
  return <p className={styles.me} role="status"><span className={styles.meLabel}>{rankingsText(locale, "rkMyRank")}</span>
    {me ? <>
      <strong>{rankingsText(locale, "rkRank", [me.rank.toLocaleString(locale)])}</strong>
      {metric === "points"
        ? <span className={styles.meValue}>{rankingsText(locale, "rkPoints", [value.toLocaleString(locale)])}</span>
        : <span className={styles.meValue} aria-label={rankingsText(locale, "rkHearts", [value.toLocaleString(locale)])}>{heartIcon(14)}<span aria-hidden="true">{value.toLocaleString(locale)}</span></span>}
      {typeof me.delta === "number" ? <RankDelta delta={me.delta} locale={locale} /> : null}
    </> : <span className={styles.meNone}>{"—"}</span>}</p>;
}
export function FootLink({ href, children }: { href: Route; children: ReactNode }) {
  return <Link className={styles.login} href={href}>{children}<span aria-hidden="true">›</span></Link>;
}
