"use client";
import type { Route } from "next";
import Link from "next/link";
import { ArrowRight } from "@/components/icons";
import { Fragment, useEffect, useLayoutEffect, useRef, useSyncExternalStore, type ReactNode } from "react";

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

/** R8-RULE-1: five rows whatever the data holds; a missing row is a quiet placeholder, so the card is the same height with 0, 2 or 20 answers. */
const ROWS = 5;
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

/** Reads again, quietly, when the tab comes back after STALE_MS. */
function useLiveRanking<T extends { computedAt: string | null }>(url: string, parse: (value: unknown) => T) {
  const { state, retry, refresh } = useRankingResource(url, parse);
  const data = state.status === "ready" ? state.data : null;
  const loadedAt = useRef(0);
  useEffect(() => { if (data) loadedAt.current = Date.now(); }, [data]);
  useEffect(() => {
    const back = () => { if (document.visibilityState === "visible" && loadedAt.current > 0 && Date.now() - loadedAt.current > STALE_MS) refresh(); };
    document.addEventListener("visibilitychange", back);
    return () => document.removeEventListener("visibilitychange", back);
  }, [refresh]);
  return { state, retry };
}
type Live<T extends { computedAt: string | null }> = ReturnType<typeof useLiveRanking<T>>;

function Rank({ rank }: { rank: number }) {
  return <span className={styles.rank} data-medal={rank <= 3 ? rank : undefined}>{rank}</span>;
}

function Rows({ children }: { children: ReactNode }) {
  return <ol className={styles.rows}>{children}</ol>;
}
/** Five rows and the bottom line, the same heights while reading, so the card does not jump when the answer comes. */
function Loading() {
  return <><Rows>{Array.from({ length: ROWS }, (_, i) => <li key={i} className={styles.row} data-row="fan-rank-loading" aria-hidden="true">
    <FanSkeleton width={20} height={16} /><FanSkeleton shape="circle" width={40} height={40} />
    <span className={styles.body}><FanSkeleton width="60%" height={14} /><FanSkeleton width="40%" height={12} /></span>
  </li>)}</Rows><div className={styles.foot} aria-hidden="true" /></>;
}
function Failed({ locale, retry }: { locale: AppLocale; retry: () => void }) {
  return <><div className={styles.state}><FanState inline compact kind="error" title={rankingsText(locale, "rkError")} actions={<FanAction variant="text" size="sm" onClick={retry}>{rankingsText(locale, "rkRetry")}</FanAction>} /></div><div className={styles.foot} aria-hidden="true" /></>;
}
/** A missing row keeps its rank number, a ring where the picture goes and a dash. With no rows at all the first one says why. */
function Placeholders({ from, emptyText }: { from: number; emptyText: string }) {
  return <>{Array.from({ length: Math.max(0, ROWS - from) }, (_, i) => {
    const note = from === 0 && i === 0;
    return <li key={`p${i}`} className={styles.row} data-row="rank-placeholder" data-placeholder="" aria-hidden={note ? undefined : true}>
      <span className={styles.rank}>{from + i + 1}</span><span className={styles.ghost} />
      <span className={styles.body}><span className={styles.ghostText}>{note ? emptyText : "\u2014"}</span></span>
    </li>;
  })}</>;
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


/** Bottom line, fixed at one height on every tab: my rank (or the way to sign in) under the fans, nothing under the creators. */
function Foot({ end }: { end: ReactNode }) {
  return <div className={styles.foot} data-empty={end ? undefined : ""}>{end}</div>;
}

const fanKey = (row: HomeFanRankingRow, index: number, rows: readonly HomeFanRankingRow[]) =>
  rows.findIndex((other) => other.nickname === row.nickname) === index ? `n:${row.nickname}` : `r:${row.rank}`;

function FanPanel({ locale, ranking, guest, scope }: { locale: AppLocale; ranking: HomeFanRanking; guest: boolean; scope: string }) {
  const shown = ranking.rows.slice(0, ROWS);
  const keys = shown.map((row, i) => fanKey(row, i, shown));
  const place = useRowMotion(keys);
  const me = ranking.me ?? ranking.rows.find((row) => row.isMe) ?? null;
  const end = guest
    ? <Link className={styles.login} href={fanLoginHref(locale, `/?locale=${locale}`)}>{rankingsText(locale, "rkSeeMyRank")}<ArrowRight aria-hidden="true" /></Link>
    : <p className={styles.me} role="status"><span className={styles.meLabel}>{rankingsText(locale, "rkMyRank")}</span>
      {me ? <><strong>{rankingsText(locale, "rkRank", [me.rank.toLocaleString(locale)])}</strong><span className={styles.meHearts} aria-label={rankingsText(locale, "rkHearts", [me.score.toLocaleString(locale)])}>{heartIcon(14)}<span aria-hidden="true">{me.score.toLocaleString(locale)}</span></span></> : <span className={styles.meNone}>{"\u2014"}</span>}</p>;
  return <>
    <Rows>{shown.map((row, i) => <li key={keys[i]} ref={place(keys[i]!)} id={`home-rank-${scope}-fans-${row.rank}`} className={styles.row} data-row="fan-rank" data-kind="fans" data-comparable={ranking.comparable || undefined} data-me={row.isMe || undefined} aria-current={row.isMe || undefined}>
      <Rank rank={row.rank} />
      <Avatar avatar={fanAvatar(row.characterId)} imageUrl={null} label="" size={40} />
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
    </li>)}<Placeholders from={shown.length} emptyText={rankingsText(locale, "rkEmptyFans")} /></Rows>
    <Foot end={end} />
  </>;
}

function CreatorPanel({ locale, ranking, scope }: { locale: AppLocale; ranking: HomeCreatorRanking; scope: string }) {
  const shown = ranking.rows.slice(0, ROWS);
  const place = useRowMotion(shown.map((row) => row.slug));
  const template = rankingsText(locale, "rkJjinfanCount", ["\u0000"]);
  return <>
    <Rows>{shown.map((row) => <li key={row.slug} ref={place(row.slug)} id={`home-rank-${scope}-creators-${row.rank}`} data-row="creator-rank">
      <Link className={styles.row} data-kind="creators" data-comparable={ranking.comparable || undefined} href={`/${row.slug}?locale=${locale}` as Route}>
        <Rank rank={row.rank} />
        <CreatorAvatar slug={row.slug} src={row.imageUrl} size={40} photos={undefined} />
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
    </li>)}<Placeholders from={shown.length} emptyText={rankingsText(locale, "rkEmpty")} /></Rows>
    <Foot end={<Link className={styles.login} href={`/rankings?locale=${locale}&tab=creators` as Route}>{rankingsText(locale, "rkViewAll")}<ArrowRight aria-hidden="true" /></Link>} />
  </>;
}

function FanBody({ locale, live, guest, scope }: { locale: AppLocale; live: Live<HomeFanRanking>; guest: boolean; scope: string }) {
  if (live.state.status === "loading") return <Loading />;
  if (live.state.status === "error") return <Failed locale={locale} retry={live.retry} />;
  return <FanPanel locale={locale} ranking={live.state.data} guest={guest} scope={scope} />;
}
function CreatorBody({ locale, live, scope }: { locale: AppLocale; live: Live<HomeCreatorRanking>; scope: string }) {
  if (live.state.status === "loading") return <Loading />;
  if (live.state.status === "error") return <Failed locale={locale} retry={live.retry} />;
  return <CreatorPanel locale={locale} ranking={live.state.data} scope={scope} />;
}

/** "업데이트 13:03" for an answer written today (viewer's clock), the date otherwise. */
export function updatedLabel(locale: AppLocale, at: string, now = new Date()) {
  const when = new Date(at);
  if (Number.isNaN(when.getTime())) return null;
  const sameDay = when.toDateString() === now.toDateString();
  const text = sameDay ? when.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) : when.toLocaleDateString(locale, { month: "numeric", day: "numeric" });
  return rankingsText(locale, "rkUpdatedAt", [text]);
}

// The narrow card's tab choice outlives the card, so coming back to the home keeps the tab the visitor chose.
let sharedTab = "fans";
const tabListeners = new Set<() => void>();
const subscribeTab = (listener: () => void) => { tabListeners.add(listener); return () => { tabListeners.delete(listener); }; };
const readTab = () => sharedTab;
const readServerTab = () => "fans";
function chooseTab(next: string) { if (next === sharedTab) return; sharedTab = next; for (const listener of tabListeners) listener(); }
/** Tests only: back to the first tab. */
export function resetHomeRankingTab() { sharedTab = "fans"; }


const computedAt = (live: { state: { status: string; data?: { computedAt: string | null } } }) => (live.state.status === "ready" ? live.state.data?.computedAt ?? null : null);

/**
 * The home ranking (261107-2 U3, feedback C3, E2; 7차 R8-RULE-1): true fans by all-time hearts (grade, favorite) and creators by true fans (hearts, this week's gain),
 * the move since yesterday once seven days are kept, and when the day was last written. Five rows on both tabs, whatever the data holds.
 * Narrow screens draw one card with two tabs; wide screens draw the two rankings as two cards side by side.
 * Public for everyone; signed out, the bottom line asks to sign in for one's own rank. The tab is local state, not the address, so the home never moves.
 */
export function HomeRankingCard({ locale, headingId = "home-ranking-heading" }: { locale: AppLocale; headingId?: string }) {
  const auth = useByUsAuth();
  const tab = useSyncExternalStore(subscribeTab, readTab, readServerTab);
  const fans = useLiveRanking(`/api/rankings/home?kind=fans&locale=${locale}`, parseFans);
  const creators = useLiveRanking(`/api/rankings/home?kind=creators&locale=${locale}`, parseCreators);
  const guest = auth.ready && !auth.authenticated;
  const all = (kind: string) => <Link className={styles.all} href={`/rankings?locale=${locale}&tab=${kind}` as Route}>{rankingsText(locale, "rkViewAll")}<ArrowRight aria-hidden="true" /></Link>;
  const sub = (kind: "fans" | "creators", at: string | null) => {
    const text = at ? updatedLabel(locale, at) : null;
    return <><span className={styles.period}>{rankingsText(locale, kind === "creators" ? "rkCumulativeFans" : "rkCumulativeHearts")}</span>{text ? <time className={styles.updated} dateTime={at!}>{text}</time> : null}</>;
  };
  const at = computedAt(tab === "creators" ? creators : fans);
  const heading = (id: string, text: string, kind: "fans" | "creators", at: string | null) => <div className={styles.headGroup}>
    <div className={styles.head}><FanHeading id={id}>{text}</FanHeading>{kind === "fans" ? all(kind) : null}</div>
    <div className={styles.sub}>{sub(kind, at)}</div>
  </div>;
  return <section className={styles.block} aria-labelledby={headingId} data-home-ranking>
    <div className={`${styles.card} ${styles.narrow}`}>
      {heading(headingId, rankingsText(locale, "rkTitle"), tab === "creators" ? "creators" : "fans", at)}
      <FanTabs variant="segment" panels label={rankingsText(locale, "rkTitle")} current={tab} items={[
        { key: "fans", label: rankingsText(locale, "rkFanTabShort"), onSelect: () => chooseTab("fans"), panel: <FanBody locale={locale} live={fans} guest={guest} scope="n" /> },
        { key: "creators", label: rankingsText(locale, "rkCreatorTabShort"), onSelect: () => chooseTab("creators"), panel: <CreatorBody locale={locale} live={creators} scope="n" /> },
      ]} />
    </div>
    <div className={styles.wide}>
      <section className={styles.card} aria-labelledby={`${headingId}-fans`}>
        {heading(`${headingId}-fans`, rankingsText(locale, "rkFanTitle"), "fans", computedAt(fans))}
        <FanBody locale={locale} live={fans} guest={guest} scope="w" />
      </section>
      <section className={styles.card} aria-labelledby={`${headingId}-creators`}>
        {heading(`${headingId}-creators`, rankingsText(locale, "rkCreatorTab"), "creators", computedAt(creators))}
        <CreatorBody locale={locale} live={creators} scope="w" />
      </section>
    </div>
  </section>;
}
