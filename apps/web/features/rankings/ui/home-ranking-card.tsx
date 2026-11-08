"use client";
import type { Route } from "next";
import Link from "next/link";
import { ChevronRight, Heart } from "@/components/fan-ui/fan-icons";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

import { FanAction } from "@/components/fan-ui/fan-action";
import { CreatorAvatar } from "@/components/fan-ui/creator-avatar";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { FanNumber } from "@/components/fan-ui/fan-number";
import { FanState } from "@/components/fan-ui/fan-state";
import { FanTabs } from "@/components/fan-ui/fan-tabs";
import { formatCountMetric } from "@/components/fan-ui/fan-count";
import { Avatar } from "@/features/profile/ui/avatar";
import type { AppLocale } from "@/i18n/locales";
import { homeCreatorRankingSchema, homeFanRankingSchema, type HomeCreatorRanking, type HomeFanRanking, type HomeFanRankingRow } from "../domain/types";
import { fanAvatar } from "./rankings-content";
import { rankingsText } from "./rankings-copy";
import { RankDelta } from "./rank-delta";
import { useRankingResource } from "./use-ranking-resource";
import styles from "./home-ranking-card.module.css";

/** 5차 R18: five rows on the home, the rest on /rankings. */
const ROWS = 5;
/** R21: a value is reused for 60s; a tab that comes back after that reads again, and an open home reads again every 90s
 * (so three minutes on the home make at most three reads of one address). */
export const RANKING_FRESH_MS = 60 * 1000;
export const RANKING_POLL_MS = 90 * 1000;
const MOVE_MS = 240;

type Extra = { period: string | null; closesAt: string | null; fetchedAt: string | null };
/** The basis values the route adds (C2: period "day", closesAt = next KST midnight, fetchedAt). Absent from an older server. */
const extrasOf = (value: { period?: string; closesAt?: string | null; fetchedAt?: string }): Extra => ({ period: value.period ?? null, closesAt: value.closesAt ?? null, fetchedAt: value.fetchedAt ?? null });
type WithExtra<T> = T & { extra: Extra };
const parseFans = (value: unknown): WithExtra<HomeFanRanking> => { const data = homeFanRankingSchema.parse(value); return { ...data, extra: extrasOf(data) }; };
const parseCreators = (value: unknown): WithExtra<HomeCreatorRanking> => { const data = homeCreatorRankingSchema.parse(value); return { ...data, extra: extrasOf(data) }; };

const reducedMotion = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** FLIP (8장 ⑧ 예외, R18): a row whose rank changed between two answers slides from its old place (transform only, 240ms) and its
 * movement mark fades in after it. Nothing moves on the first answer, on a row that kept its place, or under reduced motion. */
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
      node.querySelector<HTMLElement>("[data-delta]")?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150, delay: MOVE_MS - 150, fill: "backwards" });
    }
  }, [signature]);
  return (key: string) => (node: HTMLElement | null) => { if (node) nodes.current.set(key, node); else nodes.current.delete(key); };
}

/** Reads again when the tab comes back after RANKING_FRESH_MS, and every RANKING_POLL_MS while the page is visible. */
function useLiveRanking<T>(url: string, parse: (value: unknown) => T) {
  const { state, retry, refresh } = useRankingResource(url, parse);
  const data = state.status === "ready" ? state.data : null;
  const loadedAt = useRef(0);
  useEffect(() => { if (data) loadedAt.current = Date.now(); }, [data]);
  useEffect(() => {
    const stale = () => loadedAt.current > 0 && Date.now() - loadedAt.current >= RANKING_FRESH_MS;
    const back = () => { if (document.visibilityState === "visible" && stale()) refresh(); };
    const timer = window.setInterval(() => { if (document.visibilityState === "visible" && stale()) refresh(); }, RANKING_POLL_MS);
    document.addEventListener("visibilitychange", back);
    window.addEventListener("focus", back);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", back); window.removeEventListener("focus", back); };
  }, [refresh]);
  return { state, retry };
}

function Rows({ children }: { children: ReactNode }) {
  return <ol className={styles.rows}>{children}</ol>;
}
/** Five rows the same height while reading, so the card does not jump when the answer comes. */
function Loading() {
  return <Rows>{Array.from({ length: ROWS }, (_, i) => <li key={i} className={styles.row} aria-hidden="true" data-skeleton="">
    <FanSkeleton width={16} height={16} /><FanSkeleton shape="circle" width={32} height={32} /><FanSkeleton width="50%" height={16} /><FanSkeleton width={72} height={16} /><span />
  </li>)}</Rows>;
}
function Failed({ locale, retry }: { locale: AppLocale; retry: () => void }) {
  return <div className={styles.state}><FanState inline compact kind="error" title={rankingsText(locale, "rkError")} actions={<FanAction variant="text" size="sm" onClick={retry}>{rankingsText(locale, "rkRetry")}</FanAction>} /></div>;
}
function Empty({ title }: { title: string }) {
  return <div className={styles.state}><FanState inline compact kind="empty" title={title} /></div>;
}

/** The movement column, always drawn (R18): ▲N/▼N/— against yesterday once a week of days is kept; before that, this week's gain `+N`
 * (weekGain, rolling seven days; fan rows since 20261217010000), `—` when there is nothing to compare. */
function Delta({ locale, comparable, delta, gain }: { locale: AppLocale; comparable: boolean; delta: number | null; gain: number | null }) {
  if (comparable && delta !== null) return <span className={styles.deltaCell} data-delta={delta > 0 ? "up" : delta < 0 ? "down" : "same"}><RankDelta delta={delta} locale={locale} /></span>;
  if (!comparable && gain !== null && gain !== 0) return <span className={styles.deltaCell} data-delta="gain"><span className={styles.gain} data-tone={gain > 0 ? "up" : undefined} aria-label={rankingsText(locale, "rkWeekGain", [`${gain > 0 ? "+" : ""}${gain.toLocaleString(locale)}`])}>{gain > 0 ? "+" : ""}{formatCountMetric(locale, gain)}</span></span>;
  if (comparable && delta === null) return <span className={styles.deltaCell} data-delta="new"><span className={styles.newMark}>{rankingsText(locale, "rkDeltaNew")}</span></span>;
  return <span className={styles.deltaCell} data-delta="same"><RankDelta delta={0} locale={locale} /></span>;
}

const fanKey = (row: HomeFanRankingRow, index: number, rows: readonly HomeFanRankingRow[]) =>
  rows.findIndex((other) => other.nickname === row.nickname) === index ? `n:${row.nickname}` : `r:${row.rank}`;

function Value({ locale, value, label, icon, prefix }: { locale: AppLocale; value: number; label: string; icon?: ReactNode; prefix?: string }) {
  return <span className={styles.value} aria-label={label} data-metric="count">
    <span aria-hidden="true" className={styles.valueInner}>{icon}{prefix ? <span>{prefix}</span> : null}{value < 10_000 ? <FanNumber value={value} locale={locale} countUp className={styles.valueNumber} /> : <span>{formatCountMetric(locale, value)}</span>}</span>
  </span>;
}

function FanPanel({ locale, ranking }: { locale: AppLocale; ranking: WithExtra<HomeFanRanking> }) {
  const shown = ranking.rows.slice(0, ROWS);
  const keys = shown.map((row, i) => fanKey(row, i, shown));
  const place = useRowMotion(keys);
  if (ranking.rows.length === 0) return <Empty title={rankingsText(locale, "rkEmptyFans")} />;
  return <Rows>{shown.map((row, i) => <li key={keys[i]} ref={place(keys[i]!)} id={`home-rank-fans-${row.rank}`} className={styles.row} data-row="rank" data-motion="layout" data-me={row.isMe || undefined} aria-current={row.isMe || undefined}>
    <span className={styles.rank}>{row.rank}</span>
    <Avatar avatar={fanAvatar(row.characterId)} imageUrl={null} label="" size={32} />
    <span className={styles.name}>{row.nickname}</span>
    <Value locale={locale} value={row.score} label={rankingsText(locale, "rkHearts", [row.score.toLocaleString(locale)])} icon={<FanIcon icon={Heart} size={16} filled className={styles.heart} />} />
    <Delta locale={locale} comparable={ranking.comparable} delta={row.delta} gain={row.weekGain ?? null} />
  </li>)}</Rows>;
}

function CreatorPanel({ locale, ranking }: { locale: AppLocale; ranking: WithExtra<HomeCreatorRanking> }) {
  const shown = ranking.rows.slice(0, ROWS);
  const place = useRowMotion(shown.map((row) => row.slug));
  if (ranking.rows.length === 0) return <Empty title={rankingsText(locale, "rkEmpty")} />;
  const [before] = rankingsText(locale, "rkJjinfanCount", ["\u0000"]).split("\u0000");
  return <Rows>{shown.map((row, i) => <li key={row.slug} ref={place(row.slug)} id={`home-rank-creators-${row.rank}`} data-motion="layout">
    <Link className={styles.row} data-row="rank" href={`/${row.slug}?locale=${locale}` as Route}>
      <span className={styles.rank}>{row.rank}</span>
      <CreatorAvatar slug={row.slug} src={row.imageUrl} size={32} photos={undefined} />
      <span className={styles.name}>{row.name}</span>
      <Value locale={locale} value={row.score} label={rankingsText(locale, "rkJjinfanCount", [row.score.toLocaleString(locale)])} prefix={before?.trim() || undefined} />
      <Delta locale={locale} comparable={ranking.comparable} delta={row.delta} gain={row.weekGain} />
    </Link>
  </li>)}</Rows>;
}

type Head = { at: string | null; period: string | null; closesAt: string | null; basis: "hearts" | "fans" };

function FanTab({ locale, onHead }: { locale: AppLocale; onHead: (head: Head) => void }) {
  const { state, retry } = useLiveRanking(`/api/rankings/home?kind=fans&locale=${locale}`, parseFans);
  const data = state.status === "ready" ? state.data : null;
  useEffect(() => { if (data) onHead({ at: data.extra.fetchedAt ?? data.computedAt, period: data.extra.period, closesAt: data.extra.closesAt, basis: "hearts" }); }, [data, onHead]);
  if (state.status === "loading") return <Loading />;
  if (state.status === "error") return <Failed locale={locale} retry={retry} />;
  return <FanPanel locale={locale} ranking={state.data} />;
}

function CreatorTab({ locale, onHead }: { locale: AppLocale; onHead: (head: Head) => void }) {
  const { state, retry } = useLiveRanking(`/api/rankings/home?kind=creators&locale=${locale}`, parseCreators);
  const data = state.status === "ready" ? state.data : null;
  useEffect(() => { if (data) onHead({ at: data.extra.fetchedAt ?? data.computedAt, period: data.extra.period, closesAt: data.extra.closesAt, basis: "fans" }); }, [data, onHead]);
  if (state.status === "loading") return <Loading />;
  if (state.status === "error") return <Failed locale={locale} retry={retry} />;
  return <CreatorPanel locale={locale} ranking={state.data} />;
}

const two = (n: number) => String(n).padStart(2, "0");
/** Feed date (E-1 5): `11. 08. 13:47` (this year), `2025. 11. 08. 13:47` otherwise. Viewer's clock. */
export function feedDate(at: string | Date, now = new Date()) {
  const when = typeof at === "string" ? new Date(at) : at;
  if (Number.isNaN(when.getTime())) return null;
  const body = `${two(when.getMonth() + 1)}. ${two(when.getDate())}. ${two(when.getHours())}:${two(when.getMinutes())}`;
  return when.getFullYear() === now.getFullYear() ? body : `${when.getFullYear()}. ${body}`;
}

/** "업데이트 13:03" for an answer written today (viewer's clock), "업데이트 11. 07. 21:10" otherwise. */
export function updatedLabel(locale: AppLocale, at: string, now = new Date()) {
  const when = new Date(at);
  if (Number.isNaN(when.getTime())) return null;
  const sameDay = when.toDateString() === now.toDateString();
  return rankingsText(locale, "rkUpdatedAt", [sameDay ? `${two(when.getHours())}:${two(when.getMinutes())}` : feedDate(when, now)]);
}

/** Basis line (R12·피드백 G ①): what is counted and until when, then when it was last read. Never a week — the list is daily. */
function basisLine(locale: AppLocale, head: Head) {
  // The home list is today's standings (period "day", DESIGN §6): the basis names what is counted, the close is the next midnight.
  const items: string[] = [rankingsText(locale, head.basis === "fans" ? "rkCumulativeFans" : "rkCumulativeHearts")];
  if (head.closesAt) { const close = feedDate(head.closesAt); if (close) items.push(locale === "ko" ? `${close} 마감` : close); }
  return items.join(" · ");
}

// The tab choice is kept outside the card so a second copy (if a screen draws one) never shows the other tab.
let sharedTab = "fans";
const tabListeners = new Set<() => void>();
const subscribeTab = (listener: () => void) => { tabListeners.add(listener); return () => { tabListeners.delete(listener); }; };
const readTab = () => sharedTab;
const readServerTab = () => "fans";
function chooseTab(next: string) { if (next === sharedTab) return; sharedTab = next; for (const listener of tabListeners) listener(); }
/** Tests only: back to the first tab. */
export function resetHomeRankingTab() { sharedTab = "fans"; }

/**
 * Home ranking (5차 B5, R12·R18·R21): heading + one basis line (`누적 하트 · 업데이트 13:47`), fan / creator tabs, five 56px rows
 * (rank · avatar · name · value · movement, movement always drawn), `전체 보기 ›` to /rankings. Public for everyone.
 */
export function HomeRankingCard({ locale, headingId = "home-ranking-heading" }: { locale: AppLocale; headingId?: string }) {
  const tab = useSyncExternalStore(subscribeTab, readTab, readServerTab);
  const [heads, setHeads] = useState<{ fans: Head | null; creators: Head | null }>({ fans: null, creators: null });
  const fansHead = useCallback((head: Head) => setHeads((was) => (JSON.stringify(was.fans) === JSON.stringify(head) ? was : { ...was, fans: head })), []);
  const creatorsHead = useCallback((head: Head) => setHeads((was) => (JSON.stringify(was.creators) === JSON.stringify(head) ? was : { ...was, creators: head })), []);
  const head = (tab === "creators" ? heads.creators : heads.fans) ?? { at: null, period: null, closesAt: null, basis: tab === "creators" ? "fans" : "hearts" };
  const updatedText = head.at ? updatedLabel(locale, head.at) : null;
  return <section className={styles.card} aria-labelledby={headingId} data-home-ranking="" data-block="ranking">
    <div className={styles.head}>
      <FanHeading id={headingId}>{rankingsText(locale, "rkTitle")}</FanHeading>
      <div className={styles.basis} data-meta="" data-ranking-basis="">
        <span>{basisLine(locale, head)}</span>
        {updatedText ? <><span aria-hidden="true"> · </span><time dateTime={head.at!} data-updated-at="">{updatedText}</time></> : null}
      </div>
    </div>
    <FanTabs variant="underline" sticky={false} panels className={styles.tabs} label={rankingsText(locale, "rkTitle")} current={tab} items={[
      { key: "fans", label: rankingsText(locale, "rkFanTab"), onSelect: () => chooseTab("fans"), panel: <FanTab locale={locale} onHead={fansHead} /> },
      { key: "creators", label: rankingsText(locale, "rkCreatorRankTab"), onSelect: () => chooseTab("creators"), panel: <CreatorTab locale={locale} onHead={creatorsHead} /> },
    ]} />
    <Link className={styles.all} href={`/rankings?locale=${locale}&tab=${tab}` as Route}>{rankingsText(locale, "rkViewAll")}<FanIcon icon={ChevronRight} size={16} /></Link>
  </section>;
}
