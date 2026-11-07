"use client";

import { useState } from "react";

import { FanAction } from "@/components/fan-ui/fan-action";
import { FanTabs } from "@/components/fan-ui/fan-tabs";
import type { AppLocale } from "@/i18n/locales";
import {
  creatorRankingSchema, jjinfanChallengeSchema, pageRankingSchema, platformFanRankingSchema,
  type PageRankingMetric, type RankingPeriod,
} from "../domain/types";
import { AsOf, CreatorRankingList, FanRankingList, JjinfanProgress, MetricChips, PeriodChips, RankingClosed } from "./rankings-content";
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

export type RankingsTab = "fans" | "creators";

/** Platform fans by hearts: the same answer as the home card's fan tab (261107-2 D3), here with every period and up to 50 rows. */
function PlatformFanPanel({ locale }: { locale: AppLocale }) {
  const [period, setPeriod] = useState<RankingPeriod>("week");
  const { state, retry } = useRankingResource(`/api/rankings/fans?period=${period}&limit=50`, (v) => platformFanRankingSchema.parse(v));
  return (
    <div className={styles.tabPanel}>
      <div className={styles.controls}><PeriodChips locale={locale} period={period} onChange={setPeriod} /></div>
      {state.status === "ready" ? <><AsOf locale={locale} computedAt={state.data.computedAt} /><FanRankingList locale={locale} ranking={{ ...state.data, metric: "hearts" }} /></> : null}
      {state.status === "error" ? <Failure locale={locale} retry={retry} /> : null}
    </div>
  );
}

function CreatorPanel({ locale }: { locale: AppLocale }) {
  const [period, setPeriod] = useState<RankingPeriod>("week");
  const { state, retry } = useRankingResource(`/api/rankings/creators?period=${period}&locale=${locale}`, (v) => creatorRankingSchema.parse(v));
  return (
    <div className={styles.tabPanel}>
      <div className={styles.controls}><PeriodChips locale={locale} period={period} onChange={setPeriod} /></div>
      {state.status === "ready" ? <><AsOf locale={locale} computedAt={state.data.computedAt} /><CreatorRankingList locale={locale} ranking={state.data} /></> : null}
      {state.status === "error" ? <Failure locale={locale} retry={retry} /> : null}
    </div>
  );
}

/** The full rankings behind the home card's "view all": the same two tabs, opening on the one the card showed. */
export function CreatorRankingScreen({ locale, initialTab = "fans" }: { locale: AppLocale; initialTab?: RankingsTab }) {
  const [tab, setTab] = useState<RankingsTab>(initialTab);
  return (
    <>
      <h1>{rankingsText(locale, "rkTitle")}</h1>
      <FanTabs variant="segment" panels label={rankingsText(locale, "rkTitle")} current={tab} items={[
        { key: "fans", label: rankingsText(locale, "rkFanTitle"), onSelect: () => setTab("fans"), panel: <PlatformFanPanel locale={locale} /> },
        { key: "creators", label: rankingsText(locale, "rkCreatorTab"), onSelect: () => setTab("creators"), panel: <CreatorPanel locale={locale} /> },
      ]} />
    </>
  );
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
