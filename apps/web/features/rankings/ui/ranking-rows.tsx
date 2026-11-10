"use client";
import type { Route } from "next";
import Link from "next/link";
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { ChevronDown, ChevronUp, Heart, Minus } from "@/components/fan-ui/fan-icons";
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
  HOME_CREATOR_METRICS, HOME_FAN_METRICS,
  type HomeCreatorMetric, type HomeCreatorRanking, type HomeCreatorRankingRow, type HomeFanMetric, type HomeFanRanking, type HomeFanRankingRow,
} from "../domain/types";
import { fanAvatar } from "./rankings-content";
import { rankingsText } from "./rankings-copy";
import { RankRowPanel } from "./rank-row-panel";
import { useRankExpand } from "./use-rank-expand";
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
const inView = (node: HTMLElement) => { const box = node.getBoundingClientRect(); return box.height === 0 || (box.bottom > 0 && box.top < window.innerHeight); };
/** A row whose rank changed between two answers of the same metric slides from its old place (transform only, 240ms) and its movement mark fades in (160ms) from
 * the same frame; only rows on screen move. Nothing moves on the first answer, on a row whose place did not change, or under reduced motion. Tops are read on every commit,
 * so opening a row's panel never counts as a move. A metric change remounts the rows. */
function useRowMotion(order: readonly string[]) {
  const nodes = useRef(new Map<string, HTMLElement>());
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

/** The snapshot time in the viewer's locale; an older snapshot also keeps its date. */
export function updatedLabel(locale: AppLocale, at: string, now = new Date(), key: "rkUpdatedAt" | "rkHomeUpdated" = "rkUpdatedAt") {
  const when = new Date(at);
  if (Number.isNaN(when.getTime())) return null;
  const sameDay = when.toDateString() === now.toDateString();
  const time = when.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
  const text = sameDay ? time : `${when.toLocaleDateString(locale, { month: "numeric", day: "numeric" })} ${time}`;
  return rankingsText(locale, key, [text]);
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

const METRIC_LABEL = { hearts: "rkHeartsTab", points: "rkMetricPoints", fans: "rkCumulativeFans" } as const;
const CAPTION = { hearts: "rkCumulativeHearts", points: "rkMetricPoints", fans: "rkCumulativeFans" } as const;
/** What the list counts, then how old the snapshot is; the other metrics stay one press away at the right edge (keyboard and touch, 44px hit area). */
export function MetricLine({ locale, tab, metric, onChange, computedAt, stale = false }: { locale: AppLocale; tab: RankingsTab; metric: RankingMetric; onChange: (metric: RankingMetric) => void; computedAt: string | null; stale?: boolean }) {
  const now = useNow();
  const text = computedAt ? updatedAgoLabel(locale, computedAt, now, stale) : null;
  return <div className={styles.metricLine} data-metric-line="">
    <p className={styles.caption}><span>{rankingsText(locale, CAPTION[metric])}</span>{text ? <><span aria-hidden="true">·</span><time dateTime={computedAt!}>{text}</time></> : null}</p>
    <div className={styles.metricSwitch} role="group" aria-label={rankingsText(locale, "rkMetricLabel")}>
      {SEGMENTS[tab].map((key) => <FanAction key={key} variant="text" size="sm" className={styles.metricButton} aria-pressed={key === metric} onClick={() => onChange(key)}>{rankingsText(locale, METRIC_LABEL[key])}</FanAction>)}
    </div>
  </div>;
}

/** Numbers first: the medal artwork is not here yet, so 1-3 read as numbers too (data-medal keeps the place for it). */
function Rank({ rank }: { rank: number }) {
  return <span className={styles.rank} data-medal={rank <= 3 ? rank : undefined}>{rank}</span>;
}

/** Rows at the live height while the first answer is read; only while a request is running. */
export function LoadingRows({ count }: { count: number }) {
  return <ol className={styles.rows} aria-busy="true">{Array.from({ length: count }, (_, i) => <li key={i} className={styles.item} data-row="fan-rank-loading" aria-hidden="true">
    <span className={styles.rowFace} data-loading=""><FanSkeleton width={20} height={18} /><FanSkeleton shape="circle" width={40} height={40} />
      <span className={styles.body}><FanSkeleton width="55%" height={15} /><FanSkeleton width="35%" height={12} /></span>
      <span className={styles.value}><FanSkeleton width={48} height={15} /><FanSkeleton width={64} height={12} /></span></span>
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
/** A missing row keeps its rank number, a ring where the picture goes and a dash: no names, no values, no hidden ranks. */
function Placeholders({ from, to }: { from: number; to: number }) {
  return <>{Array.from({ length: Math.max(0, to - from) }, (_, i) => <li key={`p${i}`} className={styles.item} data-row="rank-placeholder" data-placeholder="" aria-hidden="true">
    <span className={styles.rowFace} data-placeholder=""><span className={styles.rank}>{from + i + 1}</span><span className={styles.ghost} /><span className={styles.body}><span className={styles.ghostText}>{"—"}</span></span></span>
  </li>)}</>;
}

const heartIcon = (size: 16) => <FanIcon icon={Heart} size={size} className={styles.heart} />;
const short = (locale: AppLocale, n: number) => n >= 10000 ? n.toLocaleString(locale, { notation: "compact", maximumFractionDigits: 1 }) : n.toLocaleString(locale);

/** Second line: the items that have a value, one dot between them. An item without a value leaves with its dot. */
function Meta({ items }: { items: ReactNode[] }) {
  const shown = items.filter(Boolean);
  return <span className={styles.meta}>{shown.map((item, i) => <Fragment key={i}>{i > 0 ? <span className={styles.dot} aria-hidden="true">·</span> : null}{item}</Fragment>)}</span>;
}

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

/** Rank movement against the previous built day: ▲N ink, ▼N grey, — for no change, 신규 for a row the day before did not rank. Nothing when the day has no comparison. */
function RowDelta({ locale, delta, isNew, comparable }: { locale: AppLocale; delta: number | null; isNew?: boolean; comparable: boolean }) {
  if (!comparable) return null;
  if (delta === null) return isNew ? <span className={styles.delta} data-direction="new" data-delta-cell>{rankingsText(locale, "rkDeltaNew")}</span> : null;
  const direction = delta > 0 ? "up" : delta < 0 ? "down" : "same";
  const label = delta > 0 ? rankingsText(locale, "rkDeltaUp", [delta]) : delta < 0 ? rankingsText(locale, "rkDeltaDown", [-delta]) : rankingsText(locale, "rkDeltaSame");
  return <span className={styles.delta} data-direction={direction} data-delta-cell role="img" aria-label={label}>
    {delta === 0 ? <span aria-hidden="true">{"—"}</span> : <><svg aria-hidden="true" width="8" height="7" viewBox="0 0 10 8"><path d={delta > 0 ? "M5 0 10 8H0z" : "M5 8 0 0h10z"} fill="currentColor" /></svg><span aria-hidden="true">{Math.abs(delta).toLocaleString(locale)}</span></>}
  </span>;
}

/** Today's hearts gained (counted hearts, whatever the list is ranked by): +N, grey at 0, − below 0; nothing when that day is not built. */
function TodayGain({ locale, metric, value }: { locale: AppLocale; metric: RankingMetric; value: number | null | undefined }) {
  if (typeof value !== "number") return null;
  const text = `${value < 0 ? "−" : "+"}${Math.abs(value).toLocaleString(locale)}`;
  return <span className={styles.today} data-zero={value === 0 || undefined}>{rankingsText(locale, metric === "hearts" ? "rkDayPlus" : "rkDayGain", [text])}</span>;
}

/** Under the value: the way to the first place, computed from the list itself. */
function FirstGap({ locale, first, accent, value, top }: { locale: AppLocale; first: boolean; accent: boolean; value: number; top: number }) {
  if (first) return <span className={styles.gap} data-first="" data-accent={accent || undefined}>{rankingsText(locale, "rkIsFirst")}</span>;
  return <span className={styles.gap}>{top - value <= 0 ? rankingsText(locale, "rkTiedFirst") : rankingsText(locale, "rkToFirst", [short(locale, top - value)])}</span>;
}

/** The row: one button over the whole 64px line, so the touch target is the row. The panel (if open) follows it inside the same item. */
function RowButton({ panelId, open, onToggle, me, kind, children }: { panelId: string; open: boolean; onToggle: () => void; me?: boolean; kind: RankingsTab; children: ReactNode }) {
  return <FanAction variant="text" className={styles.listRow} aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={onToggle}>
    <span className={styles.rowFace} data-kind={kind} data-me={me || undefined}>
      {children}
      <FanIcon icon={open ? ChevronUp : ChevronDown} size={16} className={styles.chevron} />
    </span>
  </FanAction>;
}
const LiveMark = ({ locale, name }: { locale: AppLocale; name: string }) => <span className={styles.live} role="img" aria-label={rankingsText(locale, "rkCreatorLive", [name])}><span className={styles.liveDot} aria-hidden="true" />LIVE</span>;


/** Keep movement eight pixels after the visible name; only the name truncates. */
function CompactIdentity({ locale, rank, delta, avatar, name, liveNow, liveLabel, isNew }: { locale: AppLocale; rank: number; delta: number | null; avatar: ReactNode; name: string; liveNow?: boolean; liveLabel?: string; isNew?: boolean }) {
  const direction = delta === null ? "unknown" : delta > 0 ? "up" : delta < 0 ? "down" : "same";
  const label = delta === null ? "—" : delta > 0 ? rankingsText(locale, "rkDeltaUp", [delta]) : delta < 0 ? rankingsText(locale, "rkDeltaDown", [-delta]) : rankingsText(locale, "rkDeltaSame");
  const Icon = delta !== null && delta > 0 ? ChevronUp : delta !== null && delta < 0 ? ChevronDown : Minus;
  return <>
    <Rank rank={rank} />
    <span className={styles.compactAvatar}>{avatar}</span>
    <span className={styles.compactPerson}><span className={styles.name} title={name}>{name}</span>
    <span className={styles.compactDelta} data-delta-cell>
      {liveNow ? <span className={styles.live} role="img" aria-label={liveLabel}><span className={styles.liveDot} /></span> : null}
      {delta === null && isNew ? null : <span className={styles.movement} data-direction={direction} role="img" aria-label={label}>
        <FanIcon icon={Icon} size={16} />{delta ? <span aria-hidden="true">{Math.abs(delta).toLocaleString(locale)}</span> : null}
      </span>}
    </span></span>
  </>;
}
function CompactValues({ locale, hearts }: { locale: AppLocale; hearts: number | undefined }) {
  const full = (n: number | null | undefined) => typeof n === "number" ? n.toLocaleString(locale) : "—";
  const short = (n: number | null | undefined) => typeof n === "number" ? n.toLocaleString(locale, { notation: n >= 10000 ? "compact" : "standard", maximumFractionDigits: 1 }) : "—";
  return <>
    <span className={styles.compactHearts} data-metric="hearts" aria-label={rankingsText(locale, "rkHearts", [full(hearts)])} title={full(hearts)}><FanIcon icon={Heart} size={16} filled /><span aria-hidden="true">{short(hearts)}</span></span>
  </>;
}


const fanValue = (row: HomeFanRankingRow, metric: RankingMetric) => metric === "points" ? row.points ?? row.score : row.hearts ?? row.score;
const fanKey = (row: HomeFanRankingRow, index: number, rows: readonly HomeFanRankingRow[]) =>
  rows.findIndex((other) => other.nickname === row.nickname) === index ? `n:${row.nickname}` : `r:${row.rank}`;

/** Fans: nickname, movement · today's gain, the metric's value and the way to first place; the row opens a panel. `fill` keeps the block at that many rows with placeholders. */
export function FanRows({ locale, ranking, metric, show, fill, scope, compact = false, guest = false }: { locale: AppLocale; ranking: HomeFanRanking; compact?: boolean; guest?: boolean; metric: HomeFanMetric; show?: number; fill?: number; scope: string }) {
  const [person, setPerson] = useState<ProfileModalPerson | null>(null);
  const { openKey, toggle } = useRankExpand();
  const shown = show === undefined ? ranking.rows : ranking.rows.slice(0, show);
  const keys = shown.map((row, i) => fanKey(row, i, shown));
  const place = useRowMotion(keys);
  const top = ranking.rows[0] ? fanValue(ranking.rows[0], metric) : 0;
  const accentFirst = !guest && !ranking.me;
  const days = ranking.weekGainDays ?? 0;
  return <><ol className={`${styles.rows}${compact ? ` ${styles.compactRows}` : ""}`}>{shown.map((row, i) => {
    const id = `rank-${scope}-fans-${row.rank}`;
    if (compact) {
      const content = <>
        <CompactIdentity locale={locale} rank={row.rank} delta={row.delta} name={row.nickname} isNew={row.isNew} avatar={<Avatar avatar={fanAvatar(row.characterId)} imageUrl={null} label="" size={28} />} />
        <CompactValues locale={locale} hearts={row.hearts ?? row.score} />
      </>;
      return <li key={keys[i]} ref={place(keys[i]!)} id={id} data-row="fan-rank" data-kind="fans" data-me={row.isMe || undefined} aria-current={row.isMe || undefined}>
        {guest ? <Link aria-label={row.nickname} className={`${styles.row} ${styles.compactRow}`} href={fanLoginHref(locale, `/?locale=${locale}`) as Route}>{content}</Link>
          : <FanAction variant="text" ariaLabel={row.nickname} className={`${styles.row} ${styles.compactRow}`} disabled={!row.profileRef} onClick={() => { if (row.profileRef) setPerson({ ref: row.profileRef, nickname: row.nickname, avatarUrl: null, tier: row.tier }); }}>{content}</FanAction>}
      </li>;
    }
    const open = openKey === keys[i];
    const value = fanValue(row, metric);
    return <li key={keys[i]} ref={place(keys[i]!)} id={id} className={styles.item} data-row="fan-rank" data-kind="fans" data-me={row.isMe || undefined} aria-current={row.isMe || undefined}>
      <RowButton panelId={`${id}-panel`} open={open} onToggle={() => toggle(keys[i]!)} me={row.isMe} kind="fans">
        <Rank rank={row.rank} />
        <span className={styles.avatar} data-first={(accentFirst && i === 0) || undefined}><Avatar avatar={fanAvatar(row.characterId)} imageUrl={null} label="" size={40} /></span>
        <span className={styles.body}>
          <span className={styles.name} title={row.nickname}>{row.nickname}</span>
          <Meta items={[<RowDelta key="d" locale={locale} delta={row.delta} isNew={row.isNew} comparable={ranking.comparable} />, <TodayGain key="t" locale={locale} metric={metric} value={row.dayGain} />]} />
        </span>
        <span className={styles.value}>
          <Main locale={locale} metric={metric} value={value} />
          <FirstGap locale={locale} first={i === 0 && ranking.rows[0] === row} accent={accentFirst} value={value} top={top} />
        </span>
      </RowButton>
      {open ? <RankRowPanel id={`${id}-panel`} kind="fan" row={row} days={days} guest={guest} locale={locale}
        onOpenProfile={() => { if (row.profileRef) setPerson({ ref: row.profileRef, nickname: row.nickname, avatarUrl: null, tier: row.tier }); }}
        loginHref={fanLoginHref(locale, `/rankings?locale=${locale}&tab=fans&metric=${metric}`)} /> : null}
    </li>;
  })}{fill ? <Placeholders from={shown.length} to={fill} /> : null}</ol>{person && !guest ? <ProfileModal person={person} locale={locale} onClose={() => setPerson(null)} /> : null}</>;
}

const creatorValue = (row: HomeCreatorRankingRow, metric: RankingMetric) => metric === "fans" ? row.fans ?? row.score : row.hearts;

/** Creators: name, movement · today's gain (and the 찐팬 100 challenge tag and LIVE where they apply), the metric's value and the way to first place; the row opens a panel whose action goes to the page. */
export function CreatorRows({ locale, ranking, metric, show, fill, scope, challengeTag = false, compact = false, guest = false }: { locale: AppLocale; ranking: HomeCreatorRanking; compact?: boolean; guest?: boolean; metric: HomeCreatorMetric; show?: number; fill?: number; scope: string; challengeTag?: boolean }) {
  const { openKey, toggle } = useRankExpand();
  const shown = show === undefined ? ranking.rows : ranking.rows.slice(0, show);
  const place = useRowMotion(shown.map((row) => row.slug));
  const top = ranking.rows[0] ? creatorValue(ranking.rows[0], metric) : 0;
  const accentFirst = !guest;
  const days = ranking.weekGainDays ?? 0;
  return <ol className={`${styles.rows}${compact ? ` ${styles.compactRows}` : ""}`}>{shown.map((row, i) => {
    const id = `rank-${scope}-creators-${row.rank}`;
    if (compact) return <li key={row.slug} ref={place(row.slug)} id={id} data-row="creator-rank">
      <Link className={`${styles.row} ${styles.compactRow}`} data-kind="creators" href={`/${row.slug}?locale=${locale}` as Route}>
        <CompactIdentity locale={locale} rank={row.rank} delta={row.delta} name={row.name} liveNow={row.liveNow} isNew={row.isNew} liveLabel={rankingsText(locale, "rkCreatorLive", [row.name])} avatar={<CreatorAvatar slug={row.slug} src={row.imageUrl} size={28} photos={undefined} />} />
        <CompactValues locale={locale} hearts={row.hearts} />
      </Link>
    </li>;
    const open = openKey === row.slug;
    const value = creatorValue(row, metric);
    return <li key={row.slug} ref={place(row.slug)} id={id} className={styles.item} data-row="creator-rank" data-kind="creators">
      <RowButton panelId={`${id}-panel`} open={open} onToggle={() => toggle(row.slug)} kind="creators">
        <Rank rank={row.rank} />
        <span className={styles.avatar} data-first={(accentFirst && i === 0) || undefined}><CreatorAvatar slug={row.slug} src={row.imageUrl} size={40} photos={undefined} /></span>
        <span className={styles.body}>
          <span className={styles.name} title={row.name}>{row.name}</span>
          <Meta items={[
            <RowDelta key="d" locale={locale} delta={row.delta} isNew={row.isNew} comparable={ranking.comparable} />,
            <TodayGain key="t" locale={locale} metric={metric} value={row.dayGain} />,
            row.liveNow ? <LiveMark key="l" locale={locale} name={row.name} /> : null,
            challengeTag && row.challenge ? <FanTag key="c" tone="fan" className={styles.challenge}>{rankingsText(locale, "jjTag")}</FanTag> : null,
          ]} />
        </span>
        <span className={styles.value}>
          <Main locale={locale} metric={metric} value={value} />
          <FirstGap locale={locale} first={i === 0 && ranking.rows[0] === row} accent={accentFirst} value={value} top={top} />
        </span>
      </RowButton>
      {open ? <RankRowPanel id={`${id}-panel`} kind="creator" row={row} days={days} guest={guest} locale={locale} /> : null}
    </li>;
  })}{fill ? <Placeholders from={shown.length} to={fill} /> : null}</ol>;
}

/** Bottom bar above the tab bar, one height on every state: my rank in the chosen metric, or (signed out) the way to sign in. */
export function Foot({ children }: { children?: ReactNode }) {
  return <div className={styles.foot} data-ranking-foot="" data-empty={children ? undefined : ""}>{children}</div>;
}
export function MyRank({ locale, ranking, metric }: { locale: AppLocale; ranking: HomeFanRanking; metric: HomeFanMetric }) {
  const me = ranking.me ?? null;
  const value = me ? (metric === "points" ? me.points ?? me.score : me.hearts ?? me.score) : 0;
  const first = ranking.rows[0];
  const gap = me && first ? fanValue(first, metric) - value : 0;
  return <p className={styles.me} role="status"><span className={styles.meLabel}>{rankingsText(locale, "rkMyRank")}</span>
    {me ? <>
      <strong className={styles.meRank}>{rankingsText(locale, "rkRank", [me.rank.toLocaleString(locale)])}</strong>
      <span className={styles.meValue}>
        {metric === "points"
          ? <span>{rankingsText(locale, "rkPoints", [short(locale, value)])}</span>
          : <span className={styles.meHearts} aria-label={rankingsText(locale, "rkHearts", [value.toLocaleString(locale)])}>{heartIcon(16)}<span aria-hidden="true">{short(locale, value)}</span></span>}
        <span className={styles.dot} aria-hidden="true">·</span>
        <span className={styles.meGap}>{me.rank === 1 ? rankingsText(locale, "rkIsFirst") : gap <= 0 ? rankingsText(locale, "rkTiedFirst") : rankingsText(locale, "rkToFirst", [short(locale, gap)])}</span>
      </span>
    </> : <span className={styles.meNone}>{"—"}</span>}</p>;
}
/** Signed out: the one primary action of the screen, in the bottom bar. */
export function FootLink({ href, children }: { href: Route; children: ReactNode }) {
  return <FanAction variant="primary" fullWidth href={href} className={styles.login}>{children}</FanAction>;
}
