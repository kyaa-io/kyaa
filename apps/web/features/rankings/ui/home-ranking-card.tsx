"use client";
import type { Route } from "next";
import Link from "next/link";
import { ArrowRight } from "@/components/icons";
import { ChevronDown, ChevronUp } from "@/components/fan-ui/fan-icons";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

import { FanAction } from "@/components/fan-ui/fan-action";
import { CreatorAvatar } from "@/components/fan-ui/creator-avatar";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { FanNumber } from "@/components/fan-ui/fan-number";
import { FanState } from "@/components/fan-ui/fan-state";
import { FanTag } from "@/components/fan-ui/fan-tag";
import { FanTabs } from "@/components/fan-ui/fan-tabs";
import { fanLoginHref } from "@/components/login-href";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { levelLabel } from "@/features/passport/domain/passport-read-model";
import { Avatar } from "@/features/profile/ui/avatar";
import { FanTierBadge } from "@/features/rewards/ui/fan-tier-badge";
import type { AppLocale } from "@/i18n/locales";
import { homeCreatorRankingSchema, homeFanRankingSchema, type HomeCreatorRanking, type HomeFanRanking, type HomeFanRankingRow } from "../domain/types";
import { fanAvatar } from "./rankings-content";
import { rankingsText } from "./rankings-copy";
import { RankDelta } from "./rank-delta";
import { useRankingResource } from "./use-ranking-resource";
import styles from "./home-ranking-card.module.css";

/** Ten rows first; "11~20위" opens the next ten inside the card, from the same answer, so the rows below never come from another ranking. */
const ROWS = 10;
/** A tab that comes back into view reads again once its answer is this old (the day table is rewritten every 10 minutes at most). */
const STALE_MS = 10 * 60 * 1000;
const MOVE_MS = 240;
const parseFans = (value: unknown) => homeFanRankingSchema.parse(value);
const parseCreators = (value: unknown) => homeCreatorRankingSchema.parse(value);

const reducedMotion = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A row whose rank changed between two answers slides from its old place (transform only, 240ms); its movement mark fades in.
 * Nothing moves on the first answer, on a row whose place did not change, or under reduced motion. */
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

/** Keeps the answer's time for the card head and reads again, quietly, when the tab comes back after STALE_MS. */
function useLiveRanking<T extends { computedAt: string | null }>(url: string, parse: (value: unknown) => T, onUpdated: (at: string | null) => void) {
  const { state, retry, refresh } = useRankingResource(url, parse);
  const data = state.status === "ready" ? state.data : null;
  const loadedAt = useRef(0);
  useEffect(() => { if (data) loadedAt.current = Date.now(); onUpdated(data?.computedAt ?? null); }, [data, onUpdated]);
  useEffect(() => {
    const back = () => { if (document.visibilityState === "visible" && loadedAt.current > 0 && Date.now() - loadedAt.current > STALE_MS) refresh(); };
    document.addEventListener("visibilitychange", back);
    return () => document.removeEventListener("visibilitychange", back);
  }, [refresh]);
  return { state, retry };
}

function Rank({ rank }: { rank: number }) {
  return <span className={styles.rank} data-medal={rank <= 3 ? rank : undefined}>{rank}</span>;
}

function Rows({ children }: { children: ReactNode }) {
  return <ol className={styles.rows}>{children}</ol>;
}
/** Ten two-line rows and the bottom line, the same heights while reading, so the card does not jump when the answer comes. */
function Loading() {
  return <><Rows>{Array.from({ length: ROWS }, (_, i) => <li key={i} className={styles.row} aria-hidden="true">
    <FanSkeleton width={20} height={16} /><FanSkeleton shape="circle" width={32} height={32} />
    <span className={styles.body}><FanSkeleton width="60%" height={14} /><FanSkeleton width="40%" height={12} /></span>
  </li>)}</Rows><div className={styles.foot} aria-hidden="true"><FanSkeleton width={64} height={16} /></div></>;
}
function Failed({ locale, retry }: { locale: AppLocale; retry: () => void }) {
  return <div className={styles.state}><FanState inline compact kind="error" title={rankingsText(locale, "rkError")} actions={<FanAction variant="text" size="sm" onClick={retry}>{rankingsText(locale, "rkRetry")}</FanAction>} /></div>;
}
/** The shape of the 찐팬 tab as last drawn (rows shown, and whether it has a bottom line). An empty tab takes that height, so switching tabs does not move the card.
 * The home draws this card twice, so the shape is shared like the tab choice. Unknown until the 찐팬 tab has drawn: then three rows. */
type PanelShape = { rows: number; foot: boolean } | null;
let fansShape: PanelShape = null;
const shapeListeners = new Set<() => void>();
const subscribeShape = (listener: () => void) => { shapeListeners.add(listener); return () => { shapeListeners.delete(listener); }; };
const readShape = () => fansShape;
function publishShape(next: { rows: number; foot: boolean }) {
  if (fansShape && fansShape.rows === next.rows && fansShape.foot === next.foot) return;
  fansShape = next; for (const listener of shapeListeners) listener();
}
/** Tests only. */
export function resetHomeRankingShape() { fansShape = null; }

/** 빈 탭: 한 줄과 행동 하나(팬페이지 목록). 하트는 팬페이지에서 보낸다. 높이는 찐팬 탭에 맞추고, 아직 모르면 행 세 줄이다. */
function Empty({ title, locale, matchFans = false }: { title: string; locale: AppLocale; matchFans?: boolean }) {
  const shape = useSyncExternalStore(subscribeShape, readShape, () => null);
  const style = matchFans && shape ? { "--rank-rows": Math.max(2, shape.rows), "--rank-foot": shape.foot ? 1 : 0 } as React.CSSProperties : undefined;
  return <div className={styles.state} data-empty="" data-match-fans={style ? "" : undefined} style={style}><FanState inline kind="empty" scope="page" title={title} actions={<FanAction variant="neutral" size="sm" href={`/celebrities?locale=${locale}`}>{rankingsText(locale, "rkBrowseFanPages")}</FanAction>} /></div>;
}

const heartIcon = (size: number) => <img src="/images/economy/heart.svg" alt="" width={size} height={size} />;

/** Second line: the items that have a value, one dot between them. An item without a value leaves with its dot. */
function Meta({ items }: { items: ReactNode[] }) {
  const shown = items.filter(Boolean);
  return <span className={styles.meta}>{shown.map((item, i) => <Fragment key={i}>{i > 0 ? <span className={styles.dot} aria-hidden="true">·</span> : null}{item}</Fragment>)}</span>;
}

/** The right-hand number of a row. It counts up only when a later answer changes it. */
function Main({ locale, value, label, icon, template }: { locale: AppLocale; value: number; label: string; icon?: ReactNode; template?: string }) {
  const [before, after] = template ? template.split("\u0000") : ["", ""];
  return <span className={styles.main} aria-label={label}>
    <span aria-hidden="true" className={styles.mainInner}>
      {icon}{before ? <span>{before.trim()}</span> : null}<FanNumber value={value} locale={locale} countUp className={styles.mainNumber} />{after ? <span>{after.trim()}</span> : null}
    </span>
  </span>;
}

/** Movement against yesterday, drawn only once seven days are kept. A row not ranked yesterday reads 신규. */
function Delta({ locale, delta }: { locale: AppLocale; delta: number | null }) {
  return <span className={styles.deltaCell} data-delta-cell>{delta === null
    ? <FanTag tone="neutral" className={styles.newTag}><span data-direction="new">{rankingsText(locale, "rkDeltaNew")}</span></FanTag>
    : <RankDelta delta={delta} locale={locale} />}</span>;
}

/** This week's gain, only when there is one: a 0 or a missing value draws nothing, so no row reads a lone 0. */
function WeekGain({ locale, value }: { locale: AppLocale; value: number | null | undefined }) {
  if (typeof value !== "number" || value <= 0) return null;
  return <span className={styles.gain} data-tone="up">{rankingsText(locale, "rkWeekGain", [`+${value.toLocaleString(locale)}`])}</span>;
}

/** Bottom line: the next ten on the left, my rank (or sign in) on the right. */
function Foot({ more, expanded, onToggle, end, locale }: { more: boolean; expanded: boolean; onToggle: () => void; end: ReactNode; locale: AppLocale }) {
  if (!more && !end) return null;
  return <div className={styles.foot}>
    {more ? <FanAction variant="text" size="sm" aria-expanded={expanded} onClick={onToggle} trailingIcon={<FanIcon icon={expanded ? ChevronUp : ChevronDown} size={16} />}>{rankingsText(locale, "rkMore1120")}</FanAction> : <span />}
    {end}
  </div>;
}

const fanKey = (row: HomeFanRankingRow, index: number, rows: readonly HomeFanRankingRow[]) =>
  rows.findIndex((other) => other.nickname === row.nickname) === index ? `n:${row.nickname}` : `r:${row.rank}`;

function FanPanel({ locale, ranking, guestEnd }: { locale: AppLocale; ranking: HomeFanRanking; guestEnd: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const shown = ranking.rows.slice(0, expanded ? ranking.rows.length : ROWS);
  const keys = shown.map((row, i) => fanKey(row, i, shown));
  const place = useRowMotion(keys);
  const hasFoot = ranking.rows.length > ROWS || (ranking.me !== null && ranking.me !== undefined && ranking.me.rank > shown.length) || Boolean(guestEnd);
  const shownRows = Math.min(shown.length, ROWS);
  useEffect(() => { if (shownRows > 0 && !expanded) publishShape({ rows: shownRows, foot: hasFoot }); }, [shownRows, hasFoot, expanded]);
  if (ranking.rows.length === 0) return <Empty title={rankingsText(locale, "rkEmptyFans")} locale={locale} />;
  const me = ranking.me && ranking.me.rank > shown.length ? ranking.me : null;
  const end = me ? <p className={styles.me} role="status"><span>{rankingsText(locale, "rkMyRank")}</span><strong>{rankingsText(locale, "rkRank", [me.rank.toLocaleString(locale)])}</strong><span className={styles.meHearts} aria-label={rankingsText(locale, "rkHearts", [me.score.toLocaleString(locale)])}>{heartIcon(14)}<span aria-hidden="true">{me.score.toLocaleString(locale)}</span></span></p> : guestEnd;
  return <>
    <Rows>{shown.map((row, i) => <li key={keys[i]} ref={place(keys[i]!)} id={`home-rank-fans-${row.rank}`} className={styles.row} data-kind="fans" data-comparable={ranking.comparable || undefined} data-me={row.isMe || undefined} aria-current={row.isMe || undefined}>
      <Rank rank={row.rank} />
      <Avatar avatar={fanAvatar(row.characterId)} imageUrl={null} label="" size={32} />
      <span className={styles.body}>
        <span className={styles.name}>{row.nickname}</span>
        <Meta items={[
          row.tier ? <span key="tier" className={styles.tier}><FanTierBadge tier={row.tier} locale={locale} size={16} /><span>{levelLabel(locale, row.tier)}</span></span> : null,
          row.favorite ? <span key="fav" className={styles.favorite}>{rankingsText(locale, "rkFavorite", [row.favorite.name])}</span> : null,
        ]} />
      </span>
      {/* R6-EXTRACT ⑦: the 4차 all-time ♥N on the right; this week's +N is added after it only when the server's weekGain is above 0. */}
      <span className={styles.value}>
        <Main locale={locale} value={row.score} label={rankingsText(locale, "rkHearts", [row.score.toLocaleString(locale)])} icon={heartIcon(14)} />
        {typeof row.weekGain === "number" && row.weekGain > 0 ? <span className={styles.gain} data-tone="up" data-week-gain="" aria-label={rankingsText(locale, "rkWeekGain", [`+${row.weekGain.toLocaleString(locale)}`])}><span aria-hidden="true">{`+${row.weekGain.toLocaleString(locale)}`}</span></span> : null}
      </span>
      {ranking.comparable ? <Delta locale={locale} delta={row.delta} /> : null}
    </li>)}</Rows>
    <Foot more={ranking.rows.length > ROWS} expanded={expanded} onToggle={() => setExpanded((open) => !open)} end={end} locale={locale} />
  </>;
}

function CreatorPanel({ locale, ranking }: { locale: AppLocale; ranking: HomeCreatorRanking }) {
  const [expanded, setExpanded] = useState(false);
  const shown = ranking.rows.slice(0, expanded ? ranking.rows.length : ROWS);
  const place = useRowMotion(shown.map((row) => row.slug));
  if (ranking.rows.length === 0) return <Empty title={rankingsText(locale, "rkEmpty")} locale={locale} matchFans />;
  const template = rankingsText(locale, "rkJjinfanCount", ["\u0000"]);
  return <>
    <Rows>{shown.map((row) => <li key={row.slug} ref={place(row.slug)} id={`home-rank-creators-${row.rank}`}>
      <Link className={styles.row} data-kind="creators" data-comparable={ranking.comparable || undefined} href={`/${row.slug}?locale=${locale}` as Route}>
        <Rank rank={row.rank} />
        <CreatorAvatar slug={row.slug} src={row.imageUrl} size={32} photos={undefined} />
        <span className={styles.body}>
          <span className={styles.name}>{row.name}</span>
          <Meta items={[
            <span key="hearts" className={styles.hearts} aria-label={rankingsText(locale, "rkHearts", [row.hearts.toLocaleString(locale)])}>{heartIcon(12)}<span aria-hidden="true">{row.hearts.toLocaleString(locale)}</span></span>,
            typeof row.weekGain === "number" && row.weekGain > 0 ? <WeekGain key="gain" locale={locale} value={row.weekGain} /> : null,
          ]} />
        </span>
        <Main locale={locale} value={row.score} label={rankingsText(locale, "rkJjinfanCount", [row.score.toLocaleString(locale)])} template={template} />
        {ranking.comparable ? <Delta locale={locale} delta={row.delta} /> : null}
      </Link>
    </li>)}</Rows>
    <Foot more={ranking.rows.length > ROWS} expanded={expanded} onToggle={() => setExpanded((open) => !open)} end={null} locale={locale} />
  </>;
}

function FanTab({ locale, guestEnd, onUpdated }: { locale: AppLocale; guestEnd: ReactNode; onUpdated: (at: string | null) => void }) {
  const { state, retry } = useLiveRanking(`/api/rankings/home?kind=fans&locale=${locale}`, parseFans, onUpdated);
  if (state.status === "loading") return <Loading />;
  if (state.status === "error") return <Failed locale={locale} retry={retry} />;
  return <FanPanel locale={locale} ranking={state.data} guestEnd={guestEnd} />;
}

function CreatorTab({ locale, onUpdated }: { locale: AppLocale; onUpdated: (at: string | null) => void }) {
  const { state, retry } = useLiveRanking(`/api/rankings/home?kind=creators&locale=${locale}`, parseCreators, onUpdated);
  if (state.status === "loading") return <Loading />;
  if (state.status === "error") return <Failed locale={locale} retry={retry} />;
  return <CreatorPanel locale={locale} ranking={state.data} />;
}

/** "업데이트 13:03" for an answer written today (viewer's clock), the date otherwise. */
export function updatedLabel(locale: AppLocale, at: string, now = new Date()) {
  const when = new Date(at);
  if (Number.isNaN(when.getTime())) return null;
  const sameDay = when.toDateString() === now.toDateString();
  const text = sameDay ? when.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) : when.toLocaleDateString(locale, { month: "numeric", day: "numeric" });
  return rankingsText(locale, "rkUpdatedAt", [text]);
}

// The home draws this card twice (narrow and wide columns, one hidden by CSS). Both copies read one tab choice, so pressing either one never leaves the visible copy on the other tab.
let sharedTab = "fans";
const tabListeners = new Set<() => void>();
const subscribeTab = (listener: () => void) => { tabListeners.add(listener); return () => { tabListeners.delete(listener); }; };
const readTab = () => sharedTab;
const readServerTab = () => "fans";
function chooseTab(next: string) { if (next === sharedTab) return; sharedTab = next; for (const listener of tabListeners) listener(); }
/** Tests only: back to the first tab. */
export function resetHomeRankingTab() { sharedTab = "fans"; }

/**
 * The home ranking (261107-2 U3, feedback C3, E2): true fans by all-time hearts (grade, favorite) and creators by true fans (hearts, this week's gain),
 * the move since yesterday once seven days are kept, and when the day was last written.
 * Public for everyone; signed out, the bottom line asks to sign in for one's own rank. The tab is local state, not the address, so the home never moves.
 */
export function HomeRankingCard({ locale, headingId = "home-ranking-heading" }: { locale: AppLocale; headingId?: string }) {
  const auth = useByUsAuth();
  const tab = useSyncExternalStore(subscribeTab, readTab, readServerTab);
  const [updated, setUpdated] = useState<{ fans: string | null; creators: string | null }>({ fans: null, creators: null });
  const fansUpdated = useCallback((at: string | null) => setUpdated((was) => (was.fans === at ? was : { ...was, fans: at })), []);
  const creatorsUpdated = useCallback((at: string | null) => setUpdated((was) => (was.creators === at ? was : { ...was, creators: at })), []);
  const at = tab === "creators" ? updated.creators : updated.fans;
  const updatedText = at ? updatedLabel(locale, at) : null;
  const guestEnd = auth.ready && !auth.authenticated ? <Link className={styles.login} href={fanLoginHref(locale, `/?locale=${locale}`)}>{rankingsText(locale, "rkSeeMyRank")}<ArrowRight aria-hidden="true" /></Link> : null;
  return <section className={styles.card} aria-labelledby={headingId} data-home-ranking>
    <div className={styles.head}>
      <div className={styles.title}><FanHeading id={headingId}>{rankingsText(locale, "rkTitle")}</FanHeading><span className={styles.period}>{rankingsText(locale, tab === "creators" ? "rkCumulativeFans" : "rkCumulativeHearts")}</span>{updatedText ? <time className={styles.updated} dateTime={at!}>{updatedText}</time> : null}</div>
      <Link className={styles.all} href={`/rankings?locale=${locale}&tab=${tab}` as Route}>{rankingsText(locale, "rkViewAll")}<ArrowRight aria-hidden="true" /></Link>
    </div>
    <FanTabs variant="segment" panels label={rankingsText(locale, "rkTitle")} current={tab} items={[
      { key: "fans", label: rankingsText(locale, "rkFanTab"), onSelect: () => chooseTab("fans"), panel: <FanTab locale={locale} guestEnd={guestEnd} onUpdated={fansUpdated} /> },
      { key: "creators", label: rankingsText(locale, "rkCreatorRankTab"), onSelect: () => chooseTab("creators"), panel: <CreatorTab locale={locale} onUpdated={creatorsUpdated} /> },
    ]} />
  </section>;
}
