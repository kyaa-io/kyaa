"use client";

import { useState } from "react";

import { FanAction } from "@/components/fan-ui/fan-action";
import type { AppLocale } from "@/i18n/locales";
import {
  jjinfanChallengeSchema, pageRankingSchema,
  type PageRankingMetric, type RankingPeriod,
} from "../domain/types";
import { AsOf, FanRankingList, JjinfanProgress, MetricChips, PeriodChips, RankingClosed } from "./rankings-content";
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
      {ranking.state.status === "ready" ? ranking.state.data.available === false ? <RankingClosed locale={locale} ranking={ranking.state.data} /> : <><AsOf locale={locale} computedAt={ranking.state.data.computedAt} /><FanRankingList locale={locale} ranking={ranking.state.data} slug={slug} /></> : null}
      {ranking.state.status === "error" ? <Failure locale={locale} retry={ranking.retry} /> : null}
    </>
  );
}
