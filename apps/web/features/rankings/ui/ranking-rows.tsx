"use client";
import type { Route } from "next";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { ChevronDown, ChevronUp, Heart } from "@/components/fan-ui/fan-icons";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { ProfileModal, type ProfileModalPerson } from "@/features/group-social/profile-modal";
import { CreatorAvatar } from "@/components/fan-ui/creator-avatar";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanNumber } from "@/components/fan-ui/fan-number";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { FanState } from "@/components/fan-ui/fan-state";
import { FanTag } from "@/components/fan-ui/fan-tag";
import { fanLoginHref } from "@/components/login-href";
import { Avatar } from "@/features/profile/ui/avatar";
import type { AppLocale } from "@/i18n/locales";
import {
  type HomeRankingPeriod, type HomeCreatorMetric, type HomeCreatorRanking, type HomeCreatorRankingRow, type HomeFanMetric, type HomeFanRanking, type HomeFanRankingRow,
} from "../domain/types";
import { fanAvatar } from "./rankings-content";
import { rankingsText } from "./rankings-copy";
import { RankRowPanel } from "./rank-row-panel";
import { useRankExpand } from "./use-rank-expand";
import { useRankingResource } from "./use-ranking-resource";
import styles from "./ranking-rows.module.css";

/** Rows of the platform rankings on the home page: rank, picture, name, movement and the metric's value on one 52px line; today's gain and the way to first place are in the opened row. */

export type RankingsTab = "fans" | "creators";
export type RankingMetric = HomeFanMetric | HomeCreatorMetric;
export const rankingUrl = (tab: RankingsTab, metric: RankingMetric, locale: AppLocale, limit?: number, period: HomeRankingPeriod = "all") =>
  `/api/rankings/home?kind=${tab}&metric=${metric}&locale=${locale}${limit ? `&limit=${limit}` : ""}${period === "all" ? "" : `&period=${period}`}`;
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
const inView = (node: HTMLElement) => { const box = node.getBoundingClientRect(); return box.height === 0 || (box.bottom > 0 && box.top < window.innerHeight); };
const RING_MS = 600;
/** The pink ring runs once around the row's border (a rotating arc seen through a 2px ring mask: transform and opacity only, 600ms). Reduced motion: the whole ring shows for 300ms and goes. */
function ringPulse(node: HTMLElement) {
  const ring = node.querySelector<HTMLElement>("[data-pulse]");
  const sweep = ring?.firstElementChild as HTMLElement | null | undefined;
  if (!ring || !sweep || typeof ring.animate !== "function") return;
  if (reducedMotion()) {
    ring.dataset.still = "";
    ring.animate([{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration: 300 }).onfinish = () => { delete ring.dataset.still; };
    return;
  }
  ring.animate([{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: RING_MS, easing: "linear" });
  sweep.animate([{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }], { duration: RING_MS, easing: "cubic-bezier(.4, 0, .2, 1)" });
}
/** A row whose rank changed between two answers of the same metric slides from its old place (transform only, 240ms) and its movement mark fades in (160ms) from
 * the same frame; only rows on screen move. Nothing moves on the first answer, on a row whose place did not change, or under reduced motion. Tops are read on every commit,
 * so opening a row's panel never counts as a move. A metric change remounts the rows. */
function useRowMotion(order: readonly string[], values: readonly number[]) {
  const nodes = useRef(new Map<string, HTMLElement>());
  const seen = useRef(new Map<string, number>());
  // A row whose value really changed since the previous answer gets the pink ring once. Nothing on the first answer; a new row has no earlier value.
  useLayoutEffect(() => {
    const before = seen.current;
    seen.current = new Map(order.map((key, i) => [key, values[i]!]));
    if (before.size === 0) return;
    for (const [key, value] of seen.current) {
      const was = before.get(key);
      const node = nodes.current.get(key);
      if (was !== undefined && was !== value && node && inView(node)) ringPulse(node);
    }
  });
  const tops = useRef(new Map<string, number>());
  const sorted = useRef(order.join("\n"));
  useLayoutEffect(() => {
    const signature = order.join("\n");
    const changed = signature !== sorted.current;
    sorted.current = signature;
    const before = tops.current;
    const after = new Map<string, number>();
    for (const [key, node] of nodes.current) after.set(key, node.offsetTop);
    tops.current = after;
    if (!changed || before.size === 0 || reducedMotion()) return;
    for (const [key, top] of after) {
      const was = before.get(key);
      const node = nodes.current.get(key);
      if (was === undefined || was === top || !node || typeof node.animate !== "function" || !inView(node)) continue;
      node.animate([{ transform: `translateY(${was - top}px)` }, { transform: "translateY(0)" }], { duration: MOVE_MS, easing: "cubic-bezier(.2, 0, 0, 1)" });
      node.querySelector<HTMLElement>("[data-delta-cell]")?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, fill: "backwards" });
    }
  });
  return (key: string) => (node: HTMLElement | null) => { if (node) nodes.current.set(key, node); else nodes.current.delete(key); };
}

/** /rankings' update line counts from the server's computedAt: seconds in tens below a minute, minutes below an hour, then (and for a stale day) the
 * Korean-time stamp `11. 09. 23:50`. The only relative time on the app; recorded as an exception in DESIGN.md. */
export function updatedAgoLabel(locale: AppLocale, computedAt: string, nowMs: number, stale = false) {
  const at = Date.parse(computedAt);
  if (Number.isNaN(at)) return null;
  const seconds = Math.max(0, Math.floor((nowMs - at) / 1000));
  if (!stale && seconds < 3600) return seconds < 60 ? rankingsText(locale, "rkUpdatedSec", [Math.floor(seconds / 10) * 10]) : rankingsText(locale, "rkUpdatedMin", [Math.floor(seconds / 60)]);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(at)).map((p) => [p.type, p.value]));
  return rankingsText(locale, "rkUpdatedStamp", [`${parts.month}. ${parts.day}. ${parts.hour}:${parts.minute}`]);
}
const AGO_TICK_MS = 10_000;
/** The current time, re-read every ten seconds while the page is visible; the timer stops when it is hidden, reads again at once when it is back, and ends on unmount. */
export function useNow(intervalMs = AGO_TICK_MS) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const stop = () => { if (timer !== undefined) { clearInterval(timer); timer = undefined; } };
    const sync = () => {
      stop();
      if (document.visibilityState !== "visible") return;
      setNow(Date.now());
      timer = setInterval(() => setNow(Date.now()), intervalMs);
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => { stop(); document.removeEventListener("visibilitychange", sync); };
  }, [intervalMs]);
  return now;
}

const CAPTION = { all: "rkCumulativeHearts", day: "rkGainDay", week: "rkGainWeek" } as const;
/** What the list counts (cumulative hearts, or hearts gained today / in seven days), then how old the snapshot is. */
export function MetricLine({ locale, computedAt, stale = false, period = "all" }: { locale: AppLocale; computedAt: string | null; stale?: boolean; period?: HomeRankingPeriod }) {
  const now = useNow();
  const text = computedAt ? updatedAgoLabel(locale, computedAt, now, stale) : null;
  return <div className={styles.metricLine} data-metric-line="">
    <p className={styles.caption}><span>{rankingsText(locale, CAPTION[period])}</span>{text ? <><span aria-hidden="true">·</span><time dateTime={computedAt!}>{text}</time></> : null}</p>
  </div>;
}

/** Numbers first: the medal artwork is not here yet, so 1-3 read as numbers too (data-medal keeps the place for it). */
function Rank({ rank }: { rank: number }) {
  return <span className={styles.rank} data-medal={rank <= 3 ? rank : undefined}>{rank}</span>;
}

/** Rows at the live height while the first answer is read; only while a request is running. */
export function LoadingRows({ count }: { count: number }) {
  return <ol className={styles.rows} aria-busy="true">{Array.from({ length: count }, (_, i) => <li key={i} className={styles.item} data-row="fan-rank-loading" aria-hidden="true">
    <span className={styles.rowFace} data-loading=""><FanSkeleton width={20} height={18} /><FanSkeleton shape="circle" width={32} height={32} />
      <span className={styles.body}><FanSkeleton width="45%" height={15} /></span>
      <span className={styles.value}><FanSkeleton width={48} height={15} /></span></span>
  </li>)}</ol>;
}
/** The error holds the block's height; the retry keeps a 44px target. The highlight above it is not drawn. */
export function FailedRows({ locale, retry, rows }: { locale: AppLocale; retry: () => void; rows: number }) {
  return <div className={styles.state} data-rows={rows}><FanState inline compact kind="error" title={rankingsText(locale, "rkError")} actions={<FanAction variant="text" size="sm" className={styles.retry} onClick={retry}>{rankingsText(locale, "rkRetry")}</FanAction>} /></div>;
}
/** Nobody is ranked: one line in the block's height. */
export function EmptyRows({ locale, text }: { locale: AppLocale; text?: string }) {
  return <div className={styles.state}><p className={styles.emptyLine} role="status">{text ?? rankingsText(locale, "rkEmpty")}</p></div>;
}
/** A missing row keeps its rank number and a ring where the picture goes: no names, no values, no marks, no hidden ranks. */
function Placeholders({ from, to }: { from: number; to: number }) {
  return <>{Array.from({ length: Math.max(0, to - from) }, (_, i) => <li key={`p${i}`} className={styles.item} data-row="rank-placeholder" data-placeholder="" aria-hidden="true">
    <span className={styles.rowFace} data-placeholder=""><span className={styles.rank}>{from + i + 1}</span><span className={styles.ghost} /></span>
  </li>)}</>;
}

const heartIcon = (size: 16) => <FanIcon icon={Heart} size={size} filled className={styles.heart} />;
const short = (locale: AppLocale, n: number) => n >= 10000 ? n.toLocaleString(locale, { notation: "compact", maximumFractionDigits: 1 }) : n.toLocaleString(locale);

/** The right-hand number of a row: the metric's value, read by name (hearts, points, fans), never from score alone. Counts up only when a later answer changes it; from 10,000 it is short (12.3K), the full number stays in the label. */
function Main({ locale, metric, value }: { locale: AppLocale; metric: RankingMetric; value: number }) {
  const n = value.toLocaleString(locale);
  const label = metric === "hearts" ? rankingsText(locale, "rkHearts", [n]) : metric === "points" ? rankingsText(locale, "rkPointsLabel", [n]) : rankingsText(locale, "rkJjinfanCount", [n]);
  const template = metric === "points" ? rankingsText(locale, "rkPoints", ["\u0000"]) : metric === "fans" ? rankingsText(locale, "rkJjinfanCount", ["\u0000"]) : "\u0000";
  const [before, after] = template.split("\u0000");
  return <span className={styles.main} aria-label={label} title={n} data-metric={metric}>
    <span aria-hidden="true" className={styles.mainInner}>
      {metric === "hearts" ? heartIcon(16) : null}{before?.trim() ? <span>{before.trim()}</span> : null}
      {value >= 10000 ? <span className={styles.mainNumber}>{short(locale, value)}</span> : <FanNumber value={value} locale={locale} countUp className={styles.mainNumber} />}{after?.trim() ? <span>{after.trim()}</span> : null}
    </span>
  </span>;
}

/** Rank movement against the previous built day: ▲N green, ▼N red. Nothing when the day has no comparison, the row was not ranked then, or it did not move (no mark for "no change"). */
function rowDelta(locale: AppLocale, delta: number | null, comparable: boolean) {
  if (!comparable || !delta) return null;
  const label = delta > 0 ? rankingsText(locale, "rkDeltaUp", [delta]) : rankingsText(locale, "rkDeltaDown", [-delta]);
  return <span className={styles.delta} data-direction={delta > 0 ? "up" : "down"} data-delta-cell role="img" aria-label={label}>
    <svg aria-hidden="true" width="8" height="7" viewBox="0 0 10 8"><path d={delta > 0 ? "M5 0 10 8H0z" : "M5 8 0 0h10z"} fill="currentColor" /></svg><span aria-hidden="true">{Math.abs(delta).toLocaleString(locale)}</span>
  </span>;
}

/** The way to first place, computed from the list itself: null on the first row (nothing to reach); 0 when tied. It opens with the row, never in the line. */
const gapToFirst = (first: boolean, value: number, top: number) => first ? null : Math.max(0, top - value);

/** One mark that rings once around the row's border when its value changes (see ringPulse); invisible otherwise. */
const Pulse = () => <span className={styles.pulse} data-pulse="" aria-hidden="true"><span className={styles.sweep} /></span>;

/** The row: one button over the whole 52px line, so the touch target is the row. The panel (if open) follows it inside the same item. */
function RowButton({ panelId, open, onToggle, me, kind, children }: { panelId: string; open: boolean; onToggle: () => void; me?: boolean; kind: RankingsTab; children: ReactNode }) {
  return <FanAction variant="text" className={styles.listRow} aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={onToggle}>
    <span className={styles.rowFace} data-kind={kind} data-me={me || undefined}>
      {children}
      <FanIcon icon={open ? ChevronUp : ChevronDown} size={16} className={styles.chevron} />
    </span>
  </FanAction>;
}
const LiveMark = ({ locale, name }: { locale: AppLocale; name: string }) => <span className={styles.live} role="img" aria-label={rankingsText(locale, "rkCreatorLive", [name])}><span className={styles.liveDot} aria-hidden="true" />LIVE</span>;


const fanValue = (row: HomeFanRankingRow, metric: RankingMetric) => metric === "points" ? row.points ?? row.score : row.hearts ?? row.score;
const fanKey = (row: HomeFanRankingRow, index: number, rows: readonly HomeFanRankingRow[]) =>
  rows.findIndex((other) => other.nickname === row.nickname) === index ? `n:${row.nickname}` : `r:${row.rank}`;

/** Fans: nickname, movement and the metric's value on one line; the row opens a panel. `fill` keeps the block at that many rows with placeholders. */
export function FanRows({ locale, ranking, metric, show, fill, scope, guest = false }: { locale: AppLocale; ranking: HomeFanRanking; guest?: boolean; metric: HomeFanMetric; show?: number; fill?: number; scope: string }) {
  const [person, setPerson] = useState<ProfileModalPerson | null>(null);
  const { openKey, toggle } = useRankExpand();
  const shown = show === undefined ? ranking.rows : ranking.rows.slice(0, show);
  const keys = shown.map((row, i) => fanKey(row, i, shown));
  const place = useRowMotion(keys, shown.map((row) => fanValue(row, metric)));
  const top = ranking.rows[0] ? fanValue(ranking.rows[0], metric) : 0;
  const accentFirst = !guest && !ranking.me;
  const days = ranking.weekGainDays ?? 0;
  return <><ol className={styles.rows}>{shown.map((row, i) => {
    const id = `rank-${scope}-fans-${row.rank}`;
    const open = openKey === keys[i];
    const value = fanValue(row, metric);
    return <li key={keys[i]} ref={place(keys[i]!)} id={id} className={styles.item} data-row="fan-rank" data-kind="fans" data-tint={((accentFirst && i === 0) || row.isMe || open) || undefined} data-me={row.isMe || undefined} aria-current={row.isMe || undefined}>
      <RowButton panelId={`${id}-panel`} open={open} onToggle={() => toggle(keys[i]!)} me={row.isMe} kind="fans">
        <Rank rank={row.rank} />
        <span className={styles.avatar} data-first={(accentFirst && i === 0) || undefined}><Avatar avatar={fanAvatar(row.characterId)} imageUrl={null} label="" size={32} /></span>
        <span className={styles.body}>
          <span className={styles.nameLine}><span className={styles.name} title={row.nickname}>{row.nickname}</span>{rowDelta(locale, row.delta, ranking.comparable)}</span>
        </span>
        <span className={styles.value}><Main locale={locale} metric={metric} value={value} /></span>
      </RowButton>
      <Pulse />
      {open ? <RankRowPanel id={`${id}-panel`} kind="fan" row={row} days={days} guest={guest} locale={locale} gap={gapToFirst(i === 0 && ranking.rows[0] === row, value, top)}
        onOpenProfile={() => { if (row.profileRef) setPerson({ ref: row.profileRef, nickname: row.nickname, avatarUrl: null, tier: row.tier }); }}
        loginHref={fanLoginHref(locale, `/?locale=${locale}`)} /> : null}
    </li>;
  })}{fill ? <Placeholders from={shown.length} to={fill} /> : null}</ol>{person && !guest ? <ProfileModal person={person} locale={locale} onClose={() => setPerson(null)} /> : null}</>;
}

const creatorValue = (row: HomeCreatorRankingRow, metric: RankingMetric) => metric === "fans" ? row.fans ?? row.score : row.hearts;

/** Creators: name, movement (and LIVE and the 찐팬 100 challenge tag where they apply) and the metric's value on one line; the row opens a panel whose action goes to the page. */
export function CreatorRows({ locale, ranking, metric, show, fill, scope, challengeTag = false, guest = false }: { locale: AppLocale; ranking: HomeCreatorRanking; guest?: boolean; metric: HomeCreatorMetric; show?: number; fill?: number; scope: string; challengeTag?: boolean }) {
  const { openKey, toggle } = useRankExpand();
  const shown = show === undefined ? ranking.rows : ranking.rows.slice(0, show);
  const place = useRowMotion(shown.map((row) => row.slug), shown.map((row) => creatorValue(row, metric)));
  const top = ranking.rows[0] ? creatorValue(ranking.rows[0], metric) : 0;
  const accentFirst = !guest;
  const days = ranking.weekGainDays ?? 0;
  return <ol className={styles.rows}>{shown.map((row, i) => {
    const id = `rank-${scope}-creators-${row.rank}`;
    const open = openKey === row.slug;
    const value = creatorValue(row, metric);
    return <li key={row.slug} ref={place(row.slug)} id={id} className={styles.item} data-row="creator-rank" data-kind="creators" data-tint={((accentFirst && i === 0) || open) || undefined}>
      <RowButton panelId={`${id}-panel`} open={open} onToggle={() => toggle(row.slug)} kind="creators">
        <Rank rank={row.rank} />
        <span className={styles.avatar} data-first={(accentFirst && i === 0) || undefined}><CreatorAvatar slug={row.slug} src={row.imageUrl} size={32} photos={undefined} /></span>
        <span className={styles.body}>
          <span className={styles.nameLine}><span className={styles.name} title={row.name}>{row.name}</span>{rowDelta(locale, row.delta, ranking.comparable)}
            {row.liveNow ? <LiveMark locale={locale} name={row.name} /> : null}
            {challengeTag && row.challenge ? <FanTag tone="fan" className={styles.challenge}>{rankingsText(locale, "jjTag")}</FanTag> : null}</span>
        </span>
        <span className={styles.value}><Main locale={locale} metric={metric} value={value} /></span>
      </RowButton>
      <Pulse />
      {open ? <RankRowPanel id={`${id}-panel`} kind="creator" row={row} days={days} guest={guest} locale={locale} gap={gapToFirst(i === 0 && ranking.rows[0] === row, value, top)} /> : null}
    </li>;
  })}{fill ? <Placeholders from={shown.length} to={fill} /> : null}</ol>;
}

/** Bottom bar above the tab bar, one height on every state: my rank in the chosen metric, or (signed out) the way to sign in. */
export function Foot({ children }: { children: ReactNode }) {
  return <div className={styles.foot} data-ranking-foot="">{children}</div>;
}
export function MyRank({ locale, ranking, metric }: { locale: AppLocale; ranking: HomeFanRanking; metric: HomeFanMetric }) {
  const me = ranking.me;
  if (!me) return null;
  const value = metric === "points" ? me.points ?? me.score : me.hearts ?? me.score;
  const first = ranking.rows[0];
  const gap = first ? fanValue(first, metric) - value : 0;
  return <p className={styles.me} role="status"><span className={styles.meLabel}>{rankingsText(locale, "rkMyRank")}</span>
    <>
      <strong className={styles.meRank}>{rankingsText(locale, "rkRank", [me.rank.toLocaleString(locale)])}</strong>
      <span className={styles.meValue}>
        {metric === "points"
          ? <span>{rankingsText(locale, "rkPoints", [short(locale, value)])}</span>
          : <span className={styles.meHearts} aria-label={rankingsText(locale, "rkHearts", [value.toLocaleString(locale)])}>{heartIcon(16)}<span aria-hidden="true">{short(locale, value)}</span></span>}
        <span className={styles.dot} aria-hidden="true">·</span>
        <span className={styles.meGap}>{me.rank === 1 ? rankingsText(locale, "rkIsFirst") : gap <= 0 ? rankingsText(locale, "rkTiedFirst") : rankingsText(locale, "rkToFirst", [short(locale, gap)])}</span>
      </span>
    </></p>;
}
/** Signed out: the one primary action of the screen, in the bottom bar. */
export function FootLink({ href, children }: { href: Route; children: ReactNode }) {
  return <FanAction variant="primary" fullWidth href={href} className={styles.login}>{children}</FanAction>;
}
