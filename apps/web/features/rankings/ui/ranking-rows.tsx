"use client";
import type { Route } from "next";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { ChevronDown, ChevronUp, Heart } from "@/components/fan-ui/fan-icons";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { ProfileModal, type ProfileModalPerson } from "@/features/group-social/profile-modal";
import { CreatorAvatar } from "@/components/fan-ui/creator-avatar";
import { FanAction } from "@/components/fan-ui/fan-action";
import { RollingNumber } from "@/components/fan-ui/rolling-number";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { FanState } from "@/components/fan-ui/fan-state";
import { FanTag } from "@/components/fan-ui/fan-tag";
import { fanLoginHref } from "@/components/login-href";
import { creatorHomeHref } from "@/features/creator/domain/creator-navigation";
import { Avatar } from "@/features/profile/ui/avatar";
import { levelLabel } from "@/features/passport/domain/passport-read-model";
import { FanTierBadge } from "@/features/rewards/ui/fan-tier-badge";
import type { AppLocale } from "@/i18n/locales";
import {
  type HomeRankingPeriod, type HomeCreatorMetric, type HomeCreatorRanking, type HomeCreatorRankingRow, type HomeFanMetric, type HomeFanRanking, type HomeFanRankingRow,
} from "../domain/types";
import { fanAvatar } from "./rankings-content";
import { rankingsText } from "./rankings-copy";
import { RankRowPanel } from "./rank-row-panel";
import { RankUnit, type RankUnitKind } from "./rank-unit";
import { useRankExpand } from "./use-rank-expand";
import { useRankingResource } from "./use-ranking-resource";
import styles from "./ranking-rows.module.css";

/** Rows of the platform rankings on the home page: rank, picture, name, movement and the metric's value on one 52px line; today's gain and the way to first place are in the opened row. */

export type RankingsTab = "fans" | "creators";
export type RankingMetric = HomeFanMetric | HomeCreatorMetric;
export const rankingUrl = (tab: RankingsTab, metric: RankingMetric, locale: AppLocale, limit?: number, period: HomeRankingPeriod = "all") =>
  `/api/rankings/home?kind=${tab}&metric=${metric}&locale=${locale}${limit ? `&limit=${limit}` : ""}${period === "all" ? "" : `&period=${period}`}`;
/** The ranking is read again every minute while the page is visible (the server keeps the snapshot it built and rewrites it on the first read after ten minutes, so a read inside the
 * minute costs the stored answer and a changed number reaches the screen within about a minute of being built). A little jitter keeps the readers from arriving together. */
const MIN_GAP_MS = 60 * 1000;
const JITTER_MS = 30 * 1000;
export function nextReadDelay(random = Math.random) {
  return MIN_GAP_MS + Math.floor(random() * JITTER_MS);
}

/** Reads the ranking and reads it again, quietly (rows stay on screen), every minute: by a timer while the page is visible (it stops when the tab is hidden), or at once when the
 * tab comes back after that moment. A failed re-read tries again a minute later. Never more often than once a minute. */
export function useLiveRanking<T extends { computedAt: string | null }>(url: string, parse: (value: unknown) => T) {
  const { state, retry, refresh } = useRankingResource(url, parse);
  const data = state.status === "ready" ? state.data : null;
  const due = useRef(0);
  useEffect(() => {
    if (!data) return;
    due.current = Date.now() + nextReadDelay();
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

/** First look at a list: the rows come in one after another from place 1 (opacity and 8px rise, 200ms, 90ms apart, at most 9 steps), places of the two columns together.
 * A ▲▼ the row carries pops in right after its row. Nothing else moves on entry: the pink ring is kept for a value that changes while the visitor watches (사용자 11/13 09:0x). */
const ENTER_MS = 200;
const ENTER_EASE = "cubic-bezier(.2, 0, 0, 1)";
const MOVE_MS = 450;
const MARK_MS = 500;
const ROLL_MS = 850;
const ROLL_EASE = "cubic-bezier(0.33, 1, 0.68, 1)";
const ROW_STAGGER_MS = 90;
const rowDelay = (index: number) => Math.min(index, 9) * ROW_STAGGER_MS;
const reducedMotion = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const inView = (node: HTMLElement) => { const box = node.getBoundingClientRect(); return document.visibilityState === "visible" && box.height > 0 && Math.min(box.bottom, window.innerHeight) - Math.max(box.top, 0) >= Math.min(box.height * 0.6, window.innerHeight); };
const RING_IN_MS = 250;
const RING_HOLD_MS = 3000;
const RING_OUT_MS = 850;
const RING_MS = RING_IN_MS + RING_HOLD_MS + RING_OUT_MS;
/** The full pink ring remains readable throughout the hold, then fades without moving the row.
 * Reduced motion uses the same colour-only emphasis; no element rotates. */
function ringPulse(node: HTMLElement, delay = 0) {
  const ring = node.querySelector<HTMLElement>("[data-pulse]");
  if (!ring || typeof ring.animate !== "function") return;
  const envelope = [{ opacity: 0, easing: "ease-out" }, { opacity: 1, offset: RING_IN_MS / RING_MS }, { opacity: 1, offset: (RING_IN_MS + RING_HOLD_MS) / RING_MS, easing: "ease-in" }, { opacity: 0 }];
  ring.dataset.still = "";
  ring.animate(envelope, { duration: RING_MS, easing: "linear", delay }).onfinish = () => { delete ring.dataset.still; };
}
/** v3: places became 1, 2, 3 … with no shared place (11/13 04:34); a v2 memory holds shared places (1, 2, 2, 2) and would read every tied row as moved. */
const SEEN_PREFIX = "kyaa:rank-seen3:";
/** What the visitor last saw in one list and period: each row's value and rank, by row key. */
type Seen = { values: Map<string, number>; ranks: Map<string, number> };
function readSeen(memory: string): Seen | null {
  try {
    const raw = window.localStorage.getItem(SEEN_PREFIX + memory);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object" || !("v" in parsed) || !("r" in parsed)) return null;
    const numbers = (value: unknown) => new Map(Object.entries(value && typeof value === "object" ? value : {}).filter((entry): entry is [string, number] => typeof entry[1] === "number"));
    return { values: numbers(parsed.v), ranks: numbers(parsed.r) };
  } catch { return null; }
}
function saveSeen(memory: string, seen: Seen) {
  try { window.localStorage.setItem(SEEN_PREFIX + memory, JSON.stringify({ v: Object.fromEntries(seen.values), r: Object.fromEntries(seen.ranks) })); } catch { /* storage blocked: the ring then follows the first view of each visit */ }
}
/** A row whose rank changed between two answers of the same metric slides from its old place (transform only, 240ms) and its movement mark fades in (160ms) from
 * the same frame; only rows on screen move. Nothing moves on the first answer, on a row whose place did not change, or under reduced motion. Tops are read on every commit,
 * so opening a row's panel never counts as a move. A metric change remounts the rows.
 * `entryRef` is the panel's own flag: the first answer the panel draws plays the entrance (rows on screen at once, the others when they reach the screen); a period switch does not. */
function useRowMotion(order: readonly string[], values: readonly number[], ranks: readonly number[], memory: string, entryRef?: { current: boolean }) {
  const nodes = useRef(new Map<string, HTMLElement>());
  const seen = useRef<Map<string, number> | null>(null);
  const seenRanks = useRef<Map<string, number> | null>(null);
  const emphasized = useRef(new Map<string, string>());
  // Where each row stood when the visitor last looked, read once: a row that moved since then shows its ▲▼ for this visit.
  const [lastVisit] = useState(() => typeof window === "undefined" ? null : readSeen(memory));
  // The ring runs only for a later answer of the same visit (the minute re-read): the rows whose value or place changed since the previous answer, or that came in.
  // The first answer rings nothing; what moved since the last visit is told by its ▲▼. A row not on screen waits until it is, then rings once.
  useLayoutEffect(() => {
    const now = new Map(order.map((key, i) => [key, values[i]!]));
    const before = seen.current;
    const beforeRanks = seenRanks.current;
    seen.current = now;
    seenRanks.current = new Map(order.map((key, i) => [key, ranks[i]!]));
    if (!now.size) return;
    saveSeen(memory, { values: now, ranks: seenRanks.current });
    if (!before || !beforeRanks) return;
    const due = order.flatMap((key, i) => {
      if (before.get(key) === values[i] && beforeRanks.get(key) === ranks[i]) return [];
      const signature = `${values[i]}|${ranks[i]}`;
      if (emphasized.current.get(key) === signature) return [];
      emphasized.current.set(key, signature);
      return [[key, i] as const];
    });
    due.forEach(([key, i]) => {
      const node = nodes.current.get(key);
      if (!node) return;
      if (inView(node)) { ringPulse(node, rowDelay(i)); return; }
      if (typeof IntersectionObserver !== "function") return;
      const cleanup = () => { watch.disconnect(); pending.current.delete(cleanup); document.removeEventListener("visibilitychange", show); };
      const show = () => { if (!inView(node)) return; cleanup(); ringPulse(node); };
      const watch = new IntersectionObserver(show, { threshold: 0.6 });
      watch.observe(node);
      pending.current.add(cleanup);
      document.addEventListener("visibilitychange", show);
    });
  });
  const pending = useRef(new Set<() => void>());
  useEffect(() => () => { for (const cleanup of pending.current) cleanup(); }, []);
  useLayoutEffect(() => {
    if (!entryRef || entryRef.current || !order.length) return;
    entryRef.current = true;
    if (reducedMotion()) return;
    const rows = order.map((key) => nodes.current.get(key)).filter((node): node is HTMLElement => !!node && typeof node.animate === "function");
    // Rows that reach the screen together come in together, top first; the step restarts for each group, so a row scrolled to later does not wait for its place number.
    const enter = (group: HTMLElement[]) => group.forEach((node, step) => {
      const delay = Math.min(step, 9) * ROW_STAGGER_MS;
      node.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: ENTER_MS, easing: ENTER_EASE, delay, fill: "backwards" });
      node.querySelector<HTMLElement>("[data-delta-cell]")?.animate([{ opacity: 0, transform: "scale(1.6)" }, { opacity: 1, transform: "scale(1)" }], { duration: MARK_MS, easing: "ease-out", delay: delay + ENTER_MS, fill: "backwards" });
    });
    const onScreen = (node: HTMLElement) => { const box = node.getBoundingClientRect(); return box.bottom > 0 && box.top < window.innerHeight; };
    const later = document.visibilityState === "visible" ? rows.filter((node) => !onScreen(node)) : rows;
    enter(rows.filter((node) => !later.includes(node)));
    if (!later.length || typeof IntersectionObserver !== "function") return;
    const waiting = new Set(later);
    const watch = new IntersectionObserver((entries) => {
      const arrived = rows.filter((node) => waiting.has(node) && entries.some((item) => item.target === node && item.isIntersecting));
      arrived.forEach((node) => { waiting.delete(node); watch.unobserve(node); });
      enter(arrived);
      if (!waiting.size) cleanup();
    });
    const cleanup = () => { watch.disconnect(); pending.current.delete(cleanup); };
    later.forEach((node) => watch.observe(node));
    pending.current.add(cleanup);
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
      if (was === undefined || was === top || !node || typeof node.animate !== "function") continue;
      const cleanup = () => { watch?.disconnect(); pending.current.delete(cleanup); document.removeEventListener("visibilitychange", show); };
      const show = () => {
        if (!inView(node)) return;
        cleanup();
        node.animate([{ transform: `translateY(${was - top}px)` }, { transform: "translateY(0)" }], { duration: MOVE_MS, easing: "cubic-bezier(.2, 0, 0, 1)" });
        node.querySelector<HTMLElement>("[data-delta-cell]")?.animate([{ opacity: 0, transform: "scale(1.6)" }, { opacity: 1, transform: "scale(1)" }], { duration: MARK_MS, easing: "ease-out", fill: "backwards" });
      };
      const watch = inView(node) || typeof IntersectionObserver !== "function" ? null : new IntersectionObserver(show, { threshold: 0.6 });
      if (watch) { watch.observe(node); pending.current.add(cleanup); document.addEventListener("visibilitychange", show); } else show();
    }
  });
  const place = (key: string) => (node: HTMLElement | null) => { if (node) nodes.current.set(key, node); else nodes.current.delete(key); };
  /** Places gained (+) or lost (−) since the visitor last looked; 0 for a row they had not seen. */
  const movedSince = (key: string, rank: number) => { const was = lastVisit?.ranks.get(key); return was === undefined ? 0 : was - rank; };
  return { place, movedSince };
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
/** The list's caption by what it counts: points earned by fans, page likes of creators (20261222140000), else hearts. */
const CAPTIONS = { points: { all: "rkCumulativePoints", day: "rkPointsDay", week: "rkPointsWeek" }, likes: { all: "rkCumulativeLikes", day: "rkLikesDay", week: "rkLikesWeek" } } as const;
/** What the list counts (cumulative hearts, or hearts gained today / in seven days), then how old the snapshot is. */
export function MetricLine({ locale, computedAt, stale = false, period = "all", metric }: { locale: AppLocale; computedAt: string | null; stale?: boolean; period?: HomeRankingPeriod; metric?: RankingMetric }) {
  const now = useNow();
  const text = computedAt ? updatedAgoLabel(locale, computedAt, now, stale) : null;
  return <div className={styles.metricLine} data-metric-line="">
    <p className={styles.caption}><span>{rankingsText(locale, metric === "points" || metric === "likes" ? CAPTIONS[metric][period] : CAPTION[period])}</span>{text ? <><span aria-hidden="true">·</span><time dateTime={computedAt!}>{text}</time></> : null}</p>
  </div>;
}

/** The rank number (rolls like a calendar page when a later answer changes it) and, right after it, the movement triangle. Numbers first: the medal artwork is not here yet, so 1-3 read as numbers too (data-medal keeps the place for it).
 * The cell is one 28px column: the number right-aligned in its box, the triangle's slot after it (empty when the row did not move), so numbers line up whether or not a mark follows. */
function Rank({ rank, mark, delay }: { rank: number; mark?: ReactNode; delay: number }) {
  return <span className={styles.rankCell}><span className={styles.rank} data-medal={rank <= 3 ? rank : undefined}><RollingNumber value={rank} duration={ROLL_MS} easing={ROLL_EASE} delay={delay} /></span>{mark}</span>;
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
    <span className={styles.rowFace} data-placeholder=""><span className={styles.rankCell}><span className={styles.rank}>{from + i + 1}</span></span><span className={styles.ghost} /></span>
  </li>)}</>;
}

const heartIcon = (size: 16) => <FanIcon icon={Heart} size={size} filled className={styles.heart} />;
const short = (locale: AppLocale, n: number) => n >= 10000 ? n.toLocaleString(locale, { notation: "compact", maximumFractionDigits: 1 }) : n.toLocaleString(locale);

const unitMark = (metric: RankingMetric) => metric === "points" ? <RankUnit unit="points" /> : metric === "fans" ? null : <RankUnit unit={metric === "likes" ? "likes" : "hearts"} />;

/** The right-hand number of a row: the metric's value, read by name (hearts, points, likes, fans), never from score alone. A zero is told, in the muted colour (GPT review 11/13: an inked 0 on most rows read as noise). Rolls like an odometer only when a later answer changes it (real values, never an invented increase); from 10,000 it is short (12.3K), the full number stays in the label. */
function Main({ locale, metric, value, delay }: { locale: AppLocale; metric: RankingMetric; value: number; delay: number }) {
  const n = value.toLocaleString(locale);
  const label = metric === "hearts" ? rankingsText(locale, "rkHearts", [n]) : metric === "points" ? rankingsText(locale, "rkPointsLabel", [n]) : metric === "likes" ? rankingsText(locale, "rkLikesCount", [n]) : rankingsText(locale, "rkJjinfanCount", [n]);
  const template = metric === "fans" ? rankingsText(locale, "rkJjinfanCount", ["\u0000"]) : "\u0000";
  const [before, after] = template.split("\u0000");
  return <span className={styles.main} aria-label={label} title={n} data-metric={metric} data-zero={value === 0 || undefined}>
    <span aria-hidden="true" className={styles.mainInner}>
      {unitMark(metric)}{before?.trim() ? <span>{before.trim()}</span> : null}
      <RollingNumber value={value} format={(v) => v >= 10000 ? short(locale, v) : v.toLocaleString(locale)} className={styles.mainNumber} duration={ROLL_MS} easing={ROLL_EASE} delay={delay} />{after?.trim() ? <span>{after.trim()}</span> : null}
    </span>
  </span>;
}

/** Rank movement as a small triangle right after the rank number (대표 11/11 19:0x): up in the accent, down in the muted blue, nothing when the day has no comparison, the row was not ranked then, or it did not move.
 * The shape and the colour carry the direction; the number of places is in the label for screen readers. */
function rowDelta(locale: AppLocale, delta: number | null, comparable: boolean) {
  if (!comparable || !delta) return null;
  const label = delta > 0 ? rankingsText(locale, "rkDeltaUp", [delta]) : rankingsText(locale, "rkDeltaDown", [-delta]);
  return <span className={styles.delta} data-direction={delta > 0 ? "up" : "down"} data-delta-cell role="img" aria-label={label}>
    <svg aria-hidden="true" width="7" height="6" viewBox="0 0 10 8"><path d={delta > 0 ? "M5 0 10 8H0z" : "M5 8 0 0h10z"} fill="currentColor" /></svg>
  </span>;
}

/** The built-day movement when the answer has one; otherwise the places gained or lost since the visitor last looked at this list. */
const visitDelta = (locale: AppLocale, delta: number | null, comparable: boolean, moved: number) => comparable && delta !== null ? rowDelta(locale, delta, true) : rowDelta(locale, moved, true);

/** The way to first place, computed from the list itself: null on the first row (nothing to reach); 0 when tied. It opens with the row, never in the line. */
const gapToFirst = (first: boolean, value: number, top: number) => first ? null : Math.max(0, top - value);

/** One mark that rings once around the row's border when its value changes (see ringPulse); invisible otherwise. */
const Pulse = () => <span className={styles.pulse} data-pulse="" aria-hidden="true"><span className={styles.sweep} /></span>;

/** The row: one button over the whole 48px line (`.toggle`, an overlay: the touch target is the row) and the visible line above it. The line lets clicks through to the button. A closed row opens
 * wherever it is tapped (대표 11/13 04:35: the tap opens the row, not the profile); only an opened row's picture and name are a link of their own (`NameTarget`). The panel (if open) follows inside the same item. */
function RowToggle({ label, panelId, open, onToggle }: { label: string; panelId: string; open: boolean; onToggle: () => void }) {
  return <FanAction variant="text" className={styles.toggle} ariaLabel={label} aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={onToggle} />;
}
function RowFace({ open, me, kind, children }: { open: boolean; me?: boolean; kind: RankingsTab; children: ReactNode }) {
  return <span className={styles.rowFace} data-kind={kind} data-me={me || undefined}>
    {children}
    <FanIcon icon={open ? ChevronUp : ChevronDown} size={16} className={styles.chevron} />
  </span>;
}
/** The picture and the name together: on an opened row, a fan's profile (signed in: opens the profile window; signed out: the way to sign in) or a creator's fan page. A closed row, or a row with no profile
 * to open (no reference), draws them as plain content, so the tap reaches the row's own button. */
function NameTarget({ active, label, href, onOpen, children }: { active: boolean; label: string; href?: string; onOpen?: () => void; children: ReactNode }) {
  if (!active) return <span className={styles.profile}><span>{children}</span></span>;
  if (href) return <FanAction variant="text" className={styles.profile} href={href} ariaLabel={label}>{children}</FanAction>;
  if (onOpen) return <FanAction variant="text" className={styles.profile} ariaLabel={label} onClick={onOpen}>{children}</FanAction>;
  return <span className={styles.profile}><span>{children}</span></span>;
}
const LiveMark = ({ locale, name }: { locale: AppLocale; name: string }) => <span className={styles.live} role="img" aria-label={rankingsText(locale, "rkCreatorLive", [name])}><span className={styles.liveDot} aria-hidden="true" />LIVE</span>;


const fanValue = (row: HomeFanRankingRow, metric: RankingMetric) => metric === "points" ? row.points ?? row.score : row.hearts ?? row.score;
/** Places in list order, 1, 2, 3 … with no shared place (대표 11/13 04:34: "1, 2, 2, 2" read as broken). The server already orders equal scores (who reached the score first, then id); the list keeps that order. */
export const listPlaces = (count: number): number[] => Array.from({ length: count }, (_, index) => index + 1);
const fanKey = (row: HomeFanRankingRow, index: number, rows: readonly HomeFanRankingRow[]) =>
  rows.findIndex((other) => other.nickname === row.nickname) === index ? `n:${row.nickname}` : `r:${row.rank}`;

/** Fans: nickname, movement and the metric's value on one line; the row opens a panel. `fill` keeps the block at that many rows with placeholders. */
export function FanRows({ locale, ranking, metric, show, fill, scope, guest = false, period = "all", entryRef }: { locale: AppLocale; ranking: HomeFanRanking; guest?: boolean; metric: HomeFanMetric; show?: number; fill?: number; scope: string; period?: HomeRankingPeriod; entryRef?: { current: boolean } }) {
  const [person, setPerson] = useState<ProfileModalPerson | null>(null);
  const { openKey, toggle } = useRankExpand();
  const shown = show === undefined ? ranking.rows : ranking.rows.slice(0, show);
  const ranks = listPlaces(shown.length);
  const keys = shown.map((row, i) => fanKey(row, i, shown));
  const { place, movedSince } = useRowMotion(keys, shown.map((row) => fanValue(row, metric)), ranks, `fans:${metric}:${period}`, entryRef);
  const top = ranking.rows[0] ? fanValue(ranking.rows[0], metric) : 0;
  const accentFirst = !guest && !ranking.me;
  const days = ranking.weekGainDays ?? 0;
  const loginHref = guest ? String(fanLoginHref(locale, `/?locale=${locale}`)) : undefined;
  return <><ol className={styles.rows}>{shown.map((row, i) => {
    const id = `rank-${scope}-fans-${row.rank}`;
    const open = openKey === keys[i];
    const value = fanValue(row, metric);
    const displayRank = ranks[i]!;
    const ref = row.profileRef;
    return <li key={keys[i]} ref={place(keys[i]!)} id={id} className={styles.item} data-row="fan-rank" data-kind="fans" data-tint={((accentFirst && i === 0) || row.isMe || open) || undefined} data-me={row.isMe || undefined} aria-current={row.isMe || undefined}>
      <RowToggle label={`${rankingsText(locale, "rkRank", [displayRank.toLocaleString(locale)])} ${row.nickname}`} panelId={`${id}-panel`} open={open} onToggle={() => toggle(keys[i]!)} />
      <RowFace open={open} me={row.isMe} kind="fans">
        <Rank rank={displayRank} delay={rowDelay(i)} mark={visitDelta(locale, row.delta, ranking.comparable, movedSince(keys[i]!, displayRank))} />
        <NameTarget
          active={open}
          label={`${row.nickname}, ${rankingsText(locale, guest ? "rkLoginProfile" : "rkViewProfile")}`}
          href={loginHref}
          onOpen={!guest && ref ? () => setPerson({ ref, nickname: row.nickname, avatarUrl: null, tier: row.tier }) : undefined}>
          <span className={styles.avatar} data-first={(accentFirst && i === 0) || undefined}><Avatar avatar={fanAvatar(row.characterId)} imageUrl={null} label="" size={28} /></span>
          <span className={styles.body}>
            <span className={styles.nameLine}><span className={styles.name} title={row.nickname}>{row.nickname}</span></span>
          </span>
        </NameTarget>
        <span className={styles.value}><Main locale={locale} metric={metric} value={value} delay={rowDelay(i)} /></span>
      </RowFace>
      <Pulse />
      {open ? <RankRowPanel id={`${id}-panel`} kind="fan" row={row} days={days} locale={locale} gap={gapToFirst(i === 0 && ranking.rows[0] === row, value, top)} unit={metric === "points" ? "points" : "hearts"} extra={fanStats(locale, row, metric)} /> : null}
    </li>;
  })}{fill ? <Placeholders from={shown.length} to={fill} /> : null}</ol>{person && !guest ? <ProfileModal person={person} locale={locale} onClose={() => setPerson(null)} /> : null}</>;
}

const creatorValue = (row: HomeCreatorRankingRow, metric: RankingMetric) => metric === "fans" ? row.fans ?? row.score : metric === "likes" ? row.likes ?? row.score : row.hearts;
/** A stat the opened row adds (대표 11/11 01:55): only a real, non-zero count; zero and a missing value leave the cell out. */
const statCell = (locale: AppLocale, key: string, label: string, value: number | null | undefined, unit: RankUnitKind) =>
  typeof value === "number" && value > 0 ? [{ key, label, value: value.toLocaleString(locale), unit }] : [];
/** Every fan row's totals, first in the opened row (사용자 11/12 12:35): the grade (the badge the app uses for it and its name in the viewer's language), then — on the points list — entry tickets,
 * check-in days, posts and hearts. A total the answer does not have, or that is zero, leaves its cell out. */
const countCell = (locale: AppLocale, key: string, label: string, value: number | null | undefined) =>
  typeof value === "number" && value > 0 ? [{ key, label, value: value.toLocaleString(locale) }] : [];
const fanStats = (locale: AppLocale, row: HomeFanRankingRow, metric: RankingMetric) => [
  ...(row.tier ? [{ key: "tier", label: rankingsText(locale, "rkPanelTier"), value: levelLabel(locale, row.tier), icon: <FanTierBadge tier={row.tier} locale={locale} size={16} /> }] : []),
  ...(metric === "points" ? [
    ...statCell(locale, "tickets", rankingsText(locale, "rkPanelTickets"), row.tickets, "tickets"),
    ...countCell(locale, "attendance", rankingsText(locale, "rkPanelAttendance"), row.attendanceDays),
    ...countCell(locale, "posts", rankingsText(locale, "rkPanelPosts"), row.posts),
    ...statCell(locale, "hearts", rankingsText(locale, "rkPanelHearts"), row.hearts, "hearts"),
  ] : []),
];

/** Creators by likes (대표 11/13 08:50 "찐팬 ♥ 5 · SNS"): the 찐팬 hearts first, with the heart asset, then all-time likes when the list counts a period.
 * No SNS follower count is stored anywhere (20261222140000), so no SNS cell is drawn; a made-up number never is. */
const creatorStats = (locale: AppLocale, row: HomeCreatorRankingRow, metric: RankingMetric, period: HomeRankingPeriod) => metric === "likes"
  ? [...statCell(locale, "hearts", rankingsText(locale, "rkPanelJjinfan"), row.hearts, "hearts").map((cell) => ({ ...cell, size: 20 as const })), ...(period === "all" ? [] : statCell(locale, "totalLikes", rankingsText(locale, "rkPanelTotalLikes"), row.totalLikes, "likes"))] : [];

/** Creators: name, movement (and LIVE and the 찐팬 100 challenge tag where they apply) and the metric's value on one line; the row opens a panel whose action goes to the page. */
export function CreatorRows({ locale, ranking, metric, show, fill, scope, challengeTag = false, guest = false, period = "all", entryRef }: { locale: AppLocale; ranking: HomeCreatorRanking; guest?: boolean; metric: HomeCreatorMetric; show?: number; fill?: number; scope: string; challengeTag?: boolean; period?: HomeRankingPeriod; entryRef?: { current: boolean } }) {
  const { openKey, toggle } = useRankExpand();
  const shown = show === undefined ? ranking.rows : ranking.rows.slice(0, show);
  const ranks = listPlaces(shown.length);
  const { place, movedSince } = useRowMotion(shown.map((row) => row.slug), shown.map((row) => creatorValue(row, metric)), ranks, `creators:${metric}:${period}`, entryRef);
  const top = ranking.rows[0] ? creatorValue(ranking.rows[0], metric) : 0;
  const accentFirst = !guest;
  const days = ranking.weekGainDays ?? 0;
  return <ol className={styles.rows}>{shown.map((row, i) => {
    const id = `rank-${scope}-creators-${row.rank}`;
    const open = openKey === row.slug;
    const value = creatorValue(row, metric);
    const displayRank = ranks[i]!;
    return <li key={row.slug} ref={place(row.slug)} id={id} className={styles.item} data-row="creator-rank" data-kind="creators" data-tint={((accentFirst && i === 0) || open) || undefined}>
      <RowToggle label={`${rankingsText(locale, "rkRank", [displayRank.toLocaleString(locale)])} ${row.name}`} panelId={`${id}-panel`} open={open} onToggle={() => toggle(row.slug)} />
      <RowFace open={open} kind="creators">
        <Rank rank={displayRank} delay={rowDelay(i)} mark={visitDelta(locale, row.delta, ranking.comparable, movedSince(row.slug, displayRank))} />
        <NameTarget active={open} label={`${row.name}, ${rankingsText(locale, "rkGoFanpage")}`} href={creatorHomeHref(row.slug, locale)}>
          <span className={styles.avatar} data-first={(accentFirst && i === 0) || undefined}><CreatorAvatar slug={row.slug} src={row.imageUrl} size={28} photos={undefined} /></span>
          <span className={styles.body}>
            <span className={styles.nameLine}><span className={styles.name} title={row.name}>{row.name}</span>
              {row.liveNow ? <LiveMark locale={locale} name={row.name} /> : null}
              {challengeTag && row.challenge ? <FanTag tone="fan" className={styles.challenge}>{rankingsText(locale, "jjTag")}</FanTag> : null}</span>
          </span>
        </NameTarget>
        <span className={styles.value}><Main locale={locale} metric={metric} value={value} delay={rowDelay(i)} /></span>
      </RowFace>
      <Pulse />
      {open ? <RankRowPanel id={`${id}-panel`} kind="creator" row={row} days={days} locale={locale} gap={gapToFirst(i === 0 && ranking.rows[0] === row, value, top)} unit={metric === "likes" ? "likes" : "hearts"} extra={creatorStats(locale, row, metric, period)} /> : null}
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
  const listed = ranking.rows.findIndex(row => row.isMe);
  const displayRank = listed >= 0 ? listed + 1 : me.rank;
  const first = ranking.rows[0];
  const gap = first ? fanValue(first, metric) - value : 0;
  return <p className={styles.me} role="status"><span className={styles.meLabel}>{rankingsText(locale, "rkMyRank")}</span>
    <>
      <strong className={styles.meRank}>{rankingsText(locale, "rkRank", [displayRank.toLocaleString(locale)])}</strong>
      <span className={styles.meValue}>
        {metric === "points"
          ? <span className={styles.meHearts} aria-label={rankingsText(locale, "rkPointsLabel", [value.toLocaleString(locale)])}><RankUnit unit="points" /><span aria-hidden="true">{short(locale, value)}</span></span>
          : <span className={styles.meHearts} aria-label={rankingsText(locale, "rkHearts", [value.toLocaleString(locale)])}>{heartIcon(16)}<span aria-hidden="true">{short(locale, value)}</span></span>}
        <span className={styles.dot} aria-hidden="true">·</span>
        <span className={styles.meGap}>{displayRank === 1 ? rankingsText(locale, "rkIsFirst") : gap <= 0 ? rankingsText(locale, "rkTiedFirst") : rankingsText(locale, "rkToFirst", [short(locale, gap)])}</span>
      </span>
    </></p>;
}
/** Signed out: the one primary action of the screen, in the bottom bar. */
export function FootLink({ href, children }: { href: Route; children: ReactNode }) {
  return <FanAction variant="primary" fullWidth href={href} className={styles.login}>{children}</FanAction>;
}
