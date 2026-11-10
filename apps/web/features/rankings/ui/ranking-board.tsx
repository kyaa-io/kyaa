"use client";

import type { Route } from "next";
import { useState, type ReactNode } from "react";

import { CreatorAvatar } from "@/components/fan-ui/creator-avatar";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { fanLoginHref } from "@/components/login-href";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { Avatar } from "@/features/profile/ui/avatar";
import type { AppLocale } from "@/i18n/locales";
import { homeCreatorRankingSchema, homeFanRankingSchema, type HomeRankingPeriod } from "../domain/types";
import { FanTabs } from "@/components/fan-ui/fan-tabs";
import { fanAvatar } from "./rankings-content";
import { RankHighlight } from "./rank-highlight";
import { CreatorRows, EmptyRows, FailedRows, FanRows, Foot, FootLink, LoadingRows, MetricLine, MyRank, rankingUrl, useLiveRanking, type Live } from "./ranking-rows";
import { rankingsText } from "./rankings-copy";
import styles from "./ranking-board.module.css";

/** Rows a list shows, and the rows a signed-in list keeps (placeholders after the last real row). */
const LIST_ROWS = 10;
const parseFans = (value: unknown) => homeFanRankingSchema.parse(value);
const parseCreators = (value: unknown) => homeCreatorRankingSchema.parse(value);

function List<T extends { computedAt: string | null; rows: readonly unknown[] }>({ locale, live, children }: { locale: AppLocale; live: Live<T>; children: (data: T) => ReactNode }) {
  if (live.state.status === "loading") return <LoadingRows count={LIST_ROWS} />;
  if (live.state.status === "error") return <FailedRows locale={locale} retry={live.retry} rows={LIST_ROWS} />;
  if (live.state.data.rows.length === 0) return <EmptyRows locale={locale} />;
  return <>{children(live.state.data)}</>;
}

/**
 * The ranking of the home page (ranking v3): 찐팬 and 크리에이터 by hearts, ten rows each, with today's biggest mover, movement, today's gain, the way to first
 * place and an opening row. Below 1024px one list at a time behind a 찐팬 | 크리에이터 segment; from 1024px both side by side, each filling half of the card's inner width.
 * Signed out: the rows the API gives and one way to sign in under the list (one for the pair on PC).
 */
export function RankingBoard({ locale, scope = "home-ranking", heading }: { locale: AppLocale; scope?: string; heading?: ReactNode }) {
  const auth = useByUsAuth();
  const guest = auth.ready && !auth.authenticated;
  const [period, setPeriod] = useState<HomeRankingPeriod>("all");
  const [tab, setTab] = useState<"fans" | "creators">("fans");
  const periods: readonly HomeRankingPeriod[] = ["day", "week", "all"];
  const label = { day: "rkPeriodDay", week: "rkPeriodWeek", all: "rkPeriodAll" } as const;
  return <>
    <div className={styles.head}>
      {heading}
      <FanTabs variant="segment" label={rankingsText(locale, "rkPeriodLabel")} current={period} items={periods.map((key) => ({ key, label: rankingsText(locale, label[key]), onSelect: () => setPeriod(key) }))} />
    </div>
    <div className={styles.tabs}>
      <FanTabs variant="segment" label={rankingsText(locale, "rkHomeTitle")} current={tab} items={[
        { key: "fans", label: rankingsText(locale, "rkHomeFans"), onSelect: () => setTab("fans") },
        { key: "creators", label: rankingsText(locale, "rkCreatorTabShort"), onSelect: () => setTab("creators") },
      ]} />
    </div>
    <div className={styles.columns}>
    <section className={styles.column} data-column="fans" data-active={tab === "fans"} aria-labelledby={`${scope}-fans`}>
      <FanHeading as="h3" id={`${scope}-fans`}>{rankingsText(locale, "rkHomeFans")}</FanHeading>
      <FanPanel locale={locale} guest={guest} scope={scope} period={period} />
    </section>
    <section className={styles.column} data-column="creators" data-active={tab === "creators"} aria-labelledby={`${scope}-creators`}>
      <FanHeading as="h3" id={`${scope}-creators`}>{rankingsText(locale, "rkCreatorTabShort")}</FanHeading>
      <CreatorPanel locale={locale} guest={guest} scope={scope} period={period} />
    </section>
  </div></>;
}

const loginBack = (locale: AppLocale) => fanLoginHref(locale, `/?locale=${locale}`) as Route;

function FanPanel({ locale, guest, scope, period }: { locale: AppLocale; guest: boolean; scope: string; period: HomeRankingPeriod }) {
  const live = useLiveRanking(rankingUrl("fans", "hearts", locale, LIST_ROWS, period), parseFans);
  const data = live.state.status === "ready" ? live.state.data : null;
  return <>
    <MetricLine locale={locale} period={period} computedAt={data?.computedAt ?? null} stale={data?.state === "stale"} />
    {live.state.status === "error" || period !== "all" ? null : <RankHighlight locale={locale} loading={!data} rows={(data?.rows ?? []).map((row, i) => ({ key: `${i}`, name: row.nickname, avatar: <Avatar avatar={fanAvatar(row.characterId)} imageUrl={null} label="" size={40} />, delta: data?.comparable ? row.delta : null, dayGain: row.dayGain }))} />}
    <div className={styles.board}>
      <List locale={locale} live={live}>{(ranking) => <FanRows locale={locale} ranking={ranking} metric="hearts" scope={scope} guest={guest} fill={guest || period !== "all" ? undefined : LIST_ROWS} />}</List>
      {guest ? <Foot><FootLink href={loginBack(locale)}>{rankingsText(locale, "rkSeeMyRank")}</FootLink></Foot>
        : data?.me ? <Foot><MyRank locale={locale} ranking={data} metric="hearts" /></Foot> : null}
    </div>
  </>;
}

function CreatorPanel({ locale, guest, scope, period }: { locale: AppLocale; guest: boolean; scope: string; period: HomeRankingPeriod }) {
  const live = useLiveRanking(rankingUrl("creators", "hearts", locale, LIST_ROWS, period), parseCreators);
  const data = live.state.status === "ready" ? live.state.data : null;
  return <>
    <MetricLine locale={locale} period={period} computedAt={data?.computedAt ?? null} stale={data?.state === "stale"} />
    {live.state.status === "error" || period !== "all" ? null : <RankHighlight locale={locale} loading={!data} rows={(data?.rows ?? []).map((row) => ({ key: row.slug, name: row.name, avatar: <CreatorAvatar slug={row.slug} src={row.imageUrl} size={40} photos={undefined} />, delta: data?.comparable ? row.delta : null, dayGain: row.dayGain }))} />}
    <div className={styles.board}>
      <List locale={locale} live={live}>{(ranking) => <CreatorRows locale={locale} ranking={ranking} metric="hearts" scope={scope} challengeTag guest={guest} fill={guest || period !== "all" ? undefined : LIST_ROWS} />}</List>
      {guest ? <div className={styles.mobileOnly}><Foot><FootLink href={loginBack(locale)}>{rankingsText(locale, "rkSeeMyRank")}</FootLink></Foot></div> : null}
    </div>
  </>;
}
