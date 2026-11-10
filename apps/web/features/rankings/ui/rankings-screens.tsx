"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { CreatorAvatar } from "@/components/fan-ui/creator-avatar";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanTabs } from "@/components/fan-ui/fan-tabs";
import { Avatar } from "@/features/profile/ui/avatar";
import type { AppLocale } from "@/i18n/locales";
import { fanLoginHref } from "@/components/login-href";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import {
  HOME_RANKING_LIMIT, homeCreatorRankingSchema, homeFanRankingSchema, jjinfanChallengeSchema, pageRankingSchema,
  type HomeCreatorMetric, type HomeFanMetric, type PageRankingMetric, type RankingPeriod,
} from "../domain/types";
import { AsOf, Empty, FanRankingList, JjinfanProgress, MetricChips, PeriodChips, RankingClosed, fanAvatar } from "./rankings-content";
import { RankHighlight } from "./rank-highlight";
import {
  CreatorRows, DEFAULT_METRIC, EmptyRows, FailedRows, FanRows, Foot, FootLink, LoadingRows, MetricLine, MyRank, metricFor, rankingUrl, useLiveRanking,
  type Live, type RankingMetric, type RankingsTab,
} from "./ranking-rows";
import { rankingsText } from "./rankings-copy";
import { useRankingResource } from "./use-ranking-resource";
import styles from "./rankings.module.css";

function Failure({ locale, retry }: { locale: AppLocale; retry: () => void }) {
  return (
    <p className={styles.state} role="alert">
      {rankingsText(locale, "rkError")}
      <FanAction variant="text" className={styles.retry} onClick={retry}>{rankingsText(locale, "rkRetry")}</FanAction>
    </p>
  );
}

export type { RankingsTab } from "./ranking-rows";

/** Rows while the first answer of a tab or metric is read, and the rows a signed-in list keeps (placeholders after the last real row). */
const LIST_ROWS = 10;
const parseFans = (value: unknown) => homeFanRankingSchema.parse(value);
const parseCreators = (value: unknown) => homeCreatorRankingSchema.parse(value);

function List<T extends { computedAt: string | null; rows: readonly unknown[] }>({ locale, live, children }: { locale: AppLocale; live: Live<T>; children: (data: T) => ReactNode }) {
  if (live.state.status === "loading") return <LoadingRows count={LIST_ROWS} />;
  if (live.state.status === "error") return <FailedRows locale={locale} retry={live.retry} rows={LIST_ROWS} />;
  if (live.state.data.rows.length === 0) return <EmptyRows locale={locale} />;
  return <>{children(live.state.data)}</>;
}

type View = { tab: RankingsTab; metrics: { fans: HomeFanMetric; creators: HomeCreatorMetric } };

/**
 * The full rankings behind the home card's "전체 보기" (ranking stage 2, D-7·D-9): the same day table as the home card, up to 50 rows, one segment per tab.
 * Below 1024px one list at a time behind the 찐팬 | 크리에이터 tabs; from 1024px both lists stand side by side (RANK-V3 C1). The address keeps the tab and
 * that tab's metric (?tab&metric), so a reload, a shared link and going back open the same list. Signed out: the rows the API gives and the way to sign in.
 */
export function CreatorRankingScreen({ locale, initialTab = "fans", initialMetric }: { locale: AppLocale; initialTab?: RankingsTab; initialMetric?: string }) {
  const router = useRouter();
  const auth = useByUsAuth();
  const guest = auth.ready && !auth.authenticated;
  const [view, setView] = useState<View>(() => ({
    tab: initialTab,
    metrics: { fans: initialTab === "fans" ? metricFor("fans", initialMetric) as HomeFanMetric : DEFAULT_METRIC.fans as HomeFanMetric, creators: initialTab === "creators" ? metricFor("creators", initialMetric) as HomeCreatorMetric : DEFAULT_METRIC.creators as HomeCreatorMetric },
  }));
  const write = (tab: RankingsTab, metric: RankingMetric) => router.replace(`/rankings?locale=${locale}&tab=${tab}&metric=${metric}` as Route, { scroll: false });
  // A tab change opens that tab on its default metric.
  const showTab = (tab: RankingsTab) => { setView((v) => ({ ...v, tab, metrics: { ...v.metrics, [tab]: DEFAULT_METRIC[tab] } })); write(tab, DEFAULT_METRIC[tab]); };
  const showMetric = (tab: RankingsTab, metric: RankingMetric) => { setView((v) => ({ tab, metrics: { ...v.metrics, [tab]: metric } })); write(tab, metric); };
  return (
    <>
      <h1>{rankingsText(locale, "rkTitle")}</h1>
      <div className={styles.mobileTabs}>
        <FanTabs variant="segment" label={rankingsText(locale, "rkTitle")} current={view.tab} items={[
          { key: "fans", label: rankingsText(locale, "rkHomeFans"), onSelect: () => showTab("fans") },
          { key: "creators", label: rankingsText(locale, "rkCreatorTabShort"), onSelect: () => showTab("creators") },
        ]} />
      </div>
      <div className={styles.columns}>
        <section className={styles.column} data-column="fans" data-active={view.tab === "fans"} aria-labelledby="rank-col-fans">
          <div className={styles.columnTitle}><FanHeading as="h2" id="rank-col-fans">{rankingsText(locale, "rkHomeFans")}</FanHeading></div>
          <FanPanel locale={locale} url={rankingUrl("fans", view.metrics.fans, locale, HOME_RANKING_LIMIT)} metric={view.metrics.fans} guest={guest} onMetric={(m) => showMetric("fans", m)} />
        </section>
        <section className={styles.column} data-column="creators" data-guest={guest ? "" : undefined} data-active={view.tab === "creators"} aria-labelledby="rank-col-creators">
          <div className={styles.columnTitle}><FanHeading as="h2" id="rank-col-creators">{rankingsText(locale, "rkCreatorTabShort")}</FanHeading></div>
          <CreatorPanel locale={locale} url={rankingUrl("creators", view.metrics.creators, locale, HOME_RANKING_LIMIT)} metric={view.metrics.creators} guest={guest} onMetric={(m) => showMetric("creators", m)} />
        </section>
      </div>
    </>
  );
}

const loginBack = (locale: AppLocale, tab: RankingsTab, metric: RankingMetric) => fanLoginHref(locale, `/rankings?locale=${locale}&tab=${tab}&metric=${metric}`) as Route;

function FanPanel({ locale, url, metric, guest, onMetric }: { locale: AppLocale; url: string; metric: HomeFanMetric; guest: boolean; onMetric: (metric: RankingMetric) => void }) {
  const live = useLiveRanking(url, parseFans);
  const data = live.state.status === "ready" ? live.state.data : null;
  return <>
    <MetricLine locale={locale} tab="fans" metric={metric} onChange={onMetric} computedAt={data?.computedAt ?? null} stale={data?.state === "stale"} />
    {live.state.status === "error" ? null : <RankHighlight locale={locale} loading={!data} rows={(data?.rows ?? []).map((row, i) => ({ key: `${i}`, name: row.nickname, avatar: <Avatar avatar={fanAvatar(row.characterId)} imageUrl={null} label="" size={40} />, delta: data?.comparable ? row.delta : null, dayGain: row.dayGain }))} />}
    <div className={styles.board}>
      <List locale={locale} live={live}>{(ranking) => <FanRows key={metric} locale={locale} ranking={ranking} metric={metric} scope="r" guest={guest} fill={guest ? undefined : LIST_ROWS} />}</List>
      {guest ? <Foot><FootLink href={loginBack(locale, "fans", metric)}>{rankingsText(locale, "rkSeeMyRank")}</FootLink></Foot>
        : data ? <Foot><MyRank locale={locale} ranking={data} metric={metric} /></Foot> : null}
    </div>
  </>;
}

function CreatorPanel({ locale, url, metric, guest, onMetric }: { locale: AppLocale; url: string; metric: HomeCreatorMetric; guest: boolean; onMetric: (metric: RankingMetric) => void }) {
  const live = useLiveRanking(url, parseCreators);
  const data = live.state.status === "ready" ? live.state.data : null;
  return <>
    <MetricLine locale={locale} tab="creators" metric={metric} onChange={onMetric} computedAt={data?.computedAt ?? null} stale={data?.state === "stale"} />
    {live.state.status === "error" ? null : <RankHighlight locale={locale} loading={!data} rows={(data?.rows ?? []).map((row) => ({ key: row.slug, name: row.name, avatar: <CreatorAvatar slug={row.slug} src={row.imageUrl} size={40} photos={undefined} />, delta: data?.comparable ? row.delta : null, dayGain: row.dayGain }))} />}
    <div className={styles.board}>
      <List locale={locale} live={live}>{(ranking) => <CreatorRows key={metric} locale={locale} ranking={ranking} metric={metric} scope="r" challengeTag guest={guest} fill={guest ? undefined : LIST_ROWS} />}</List>
      {guest ? <Foot><FootLink href={loginBack(locale, "creators", metric)}>{rankingsText(locale, "rkSeeMyRank")}</FootLink></Foot> : null}
    </div>
  </>;
}

export function FanRankingScreen({ locale, slug }: { locale: AppLocale; slug: string }) {
  const [period, setPeriod] = useState<RankingPeriod>("week");
  const [metric, setMetric] = useState<PageRankingMetric>("hearts");
  // Fan activity has no all-time board, so switching to it from "all" falls back to the month.
  const effectivePeriod: RankingPeriod = metric === "dukjil" && period === "all" ? "month" : period;
  const ranking = useRankingResource(`/api/pages/${encodeURIComponent(slug)}/rankings?metric=${metric}&period=${effectivePeriod}`, (v) => pageRankingSchema.parse(v));
  const challenge = useRankingResource(`/api/pages/${encodeURIComponent(slug)}/jjinfan-challenge`, (v) => jjinfanChallengeSchema.parse(v));
  return (
    <>
      <h1>{rankingsText(locale, "rkFanTitle")}</h1>
      {challenge.state.status === "ready" ? <JjinfanProgress locale={locale} count={challenge.state.data.count} target={challenge.state.data.target} /> : null}
      <div className={styles.controls}>
        <MetricChips locale={locale} metric={metric} onChange={setMetric} />
        <PeriodChips locale={locale} period={effectivePeriod} onChange={setPeriod} />
      </div>
      {ranking.state.status === "ready" ? ranking.state.data.available === false ? <RankingClosed locale={locale} ranking={ranking.state.data} /> : <><AsOf locale={locale} computedAt={ranking.state.data.computedAt} /><FanRankingList locale={locale} ranking={ranking.state.data} /></> : null}
      {ranking.state.status === "error" ? <Failure locale={locale} retry={ranking.retry} /> : null}
    </>
  );
}
