"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { FanAction } from "@/components/fan-ui/fan-action";
import { FanTabs } from "@/components/fan-ui/fan-tabs";
import type { AppLocale } from "@/i18n/locales";
import { fanLoginHref } from "@/components/login-href";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import {
  HOME_RANKING_LIMIT, homeCreatorRankingSchema, homeFanRankingSchema, jjinfanChallengeSchema, pageRankingSchema,
  type HomeCreatorMetric, type HomeFanMetric, type PageRankingMetric, type RankingPeriod,
} from "../domain/types";
import { AsOf, Empty, FanRankingList, JjinfanProgress, MetricChips, PeriodChips, RankingClosed } from "./rankings-content";
import {
  CreatorRows, DEFAULT_METRIC, FanRows, Foot, FootLink, LoadingRows, MetricLine, MyRank, metricFor, rankingUrl, useLiveRanking,
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

/** Rows while the first answer of a tab or metric is read (no rows of the previous metric stay). */
const LOADING_ROWS = 10;
const parseFans = (value: unknown) => homeFanRankingSchema.parse(value);
const parseCreators = (value: unknown) => homeCreatorRankingSchema.parse(value);

function List<T extends { computedAt: string | null; rows: readonly unknown[] }>({ locale, live, children }: { locale: AppLocale; live: Live<T>; children: (data: T) => ReactNode }) {
  if (live.state.status === "loading") return <LoadingRows count={LOADING_ROWS} />;
  if (live.state.status === "error") return <Failure locale={locale} retry={live.retry} />;
  if (live.state.data.rows.length === 0) return <Empty locale={locale} />;
  return <>{children(live.state.data)}</>;
}

/**
 * The full rankings behind the home card's "전체 보기" (ranking stage 2, D-7·D-9): the same day table as the home card, up to 50 rows, the same
 * row as the card, the same metric segment; no period chips and no podium. The address keeps the tab and the metric (?tab&metric), so a reload,
 * a shared link and going back open the same list. Signed out: the five rows the API gives and the way to sign in back to this list.
 */
export function CreatorRankingScreen({ locale, initialTab = "fans", initialMetric }: { locale: AppLocale; initialTab?: RankingsTab; initialMetric?: string }) {
  const router = useRouter();
  const auth = useByUsAuth();
  const guest = auth.ready && !auth.authenticated;
  const [view, setView] = useState<{ tab: RankingsTab; metric: RankingMetric }>(() => ({ tab: initialTab, metric: metricFor(initialTab, initialMetric) }));
  const show = (tab: RankingsTab, metric: RankingMetric) => {
    setView({ tab, metric });
    router.replace(`/rankings?locale=${locale}&tab=${tab}&metric=${metric}` as Route, { scroll: false });
  };
  const url = rankingUrl(view.tab, view.metric, locale, HOME_RANKING_LIMIT);
  const panel = (tab: RankingsTab) => view.tab !== tab ? null : <div className={styles.tabPanel}>
    {tab === "fans" ? <FanPanel locale={locale} url={url} metric={view.metric as HomeFanMetric} guest={guest} onMetric={(m) => show("fans", m)} />
      : <CreatorPanel locale={locale} url={url} metric={view.metric as HomeCreatorMetric} guest={guest} onMetric={(m) => show("creators", m)} />}
  </div>;
  return (
    <>
      <h1>{rankingsText(locale, "rkTitle")}</h1>
      <FanTabs variant="segment" panels label={rankingsText(locale, "rkTitle")} current={view.tab} items={[
        // A tab change opens that tab on its default metric.
        { key: "fans", label: rankingsText(locale, "rkFanTitle"), onSelect: () => show("fans", DEFAULT_METRIC.fans), panel: panel("fans") },
        { key: "creators", label: rankingsText(locale, "rkCreatorTab"), onSelect: () => show("creators", DEFAULT_METRIC.creators), panel: panel("creators") },
      ]} />
    </>
  );
}

const loginBack = (locale: AppLocale, tab: RankingsTab, metric: RankingMetric) => fanLoginHref(locale, `/rankings?locale=${locale}&tab=${tab}&metric=${metric}`) as Route;

function FanPanel({ locale, url, metric, guest, onMetric }: { locale: AppLocale; url: string; metric: HomeFanMetric; guest: boolean; onMetric: (metric: RankingMetric) => void }) {
  const live = useLiveRanking(url, parseFans);
  return <>
    <MetricLine locale={locale} tab="fans" metric={metric} onChange={onMetric} computedAt={live.state.status === "ready" ? live.state.data.computedAt : null} />
    <div className={styles.board}>
      <List locale={locale} live={live}>{(data) => <FanRows key={metric} locale={locale} ranking={data} metric={metric} scope="r" />}</List>
      {guest ? <Foot><FootLink href={loginBack(locale, "fans", metric)}>{rankingsText(locale, "rkSeeMyRank")}</FootLink></Foot>
        : live.state.status === "ready" ? <Foot><MyRank locale={locale} ranking={live.state.data} metric={metric} /></Foot> : null}
    </div>
  </>;
}

function CreatorPanel({ locale, url, metric, guest, onMetric }: { locale: AppLocale; url: string; metric: HomeCreatorMetric; guest: boolean; onMetric: (metric: RankingMetric) => void }) {
  const live = useLiveRanking(url, parseCreators);
  return <>
    <MetricLine locale={locale} tab="creators" metric={metric} onChange={onMetric} computedAt={live.state.status === "ready" ? live.state.data.computedAt : null} />
    <div className={styles.board}>
      <List locale={locale} live={live}>{(data) => <CreatorRows key={metric} locale={locale} ranking={data} metric={metric} scope="r" challengeTag />}</List>
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
