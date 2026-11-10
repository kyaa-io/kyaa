"use client";

import type { Route } from "next";
import type { ReactNode } from "react";

import { CreatorAvatar } from "@/components/fan-ui/creator-avatar";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { fanLoginHref } from "@/components/login-href";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { Avatar } from "@/features/profile/ui/avatar";
import type { AppLocale } from "@/i18n/locales";
import { homeCreatorRankingSchema, homeFanRankingSchema } from "../domain/types";
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
 * place and an opening row. Below 1024px the two lists stand one under the other; from 1024px side by side, each filling half of the card's inner width.
 * Signed out: the rows the API gives and one way to sign in, under the 찐팬 list.
 */
export function RankingBoard({ locale, scope = "home-ranking" }: { locale: AppLocale; scope?: string }) {
  const auth = useByUsAuth();
  const guest = auth.ready && !auth.authenticated;
  return <div className={styles.columns}>
    <section className={styles.column} data-column="fans" aria-labelledby={`${scope}-fans`}>
      <FanHeading as="h3" id={`${scope}-fans`}>{rankingsText(locale, "rkHomeFans")}</FanHeading>
      <FanPanel locale={locale} guest={guest} scope={scope} />
    </section>
    <section className={styles.column} data-column="creators" aria-labelledby={`${scope}-creators`}>
      <FanHeading as="h3" id={`${scope}-creators`}>{rankingsText(locale, "rkCreatorTabShort")}</FanHeading>
      <CreatorPanel locale={locale} guest={guest} scope={scope} />
    </section>
  </div>;
}

const loginBack = (locale: AppLocale) => fanLoginHref(locale, `/?locale=${locale}`) as Route;

function FanPanel({ locale, guest, scope }: { locale: AppLocale; guest: boolean; scope: string }) {
  const live = useLiveRanking(rankingUrl("fans", "hearts", locale, LIST_ROWS), parseFans);
  const data = live.state.status === "ready" ? live.state.data : null;
  return <>
    <MetricLine locale={locale} computedAt={data?.computedAt ?? null} stale={data?.state === "stale"} />
    {live.state.status === "error" ? null : <RankHighlight locale={locale} loading={!data} rows={(data?.rows ?? []).map((row, i) => ({ key: `${i}`, name: row.nickname, avatar: <Avatar avatar={fanAvatar(row.characterId)} imageUrl={null} label="" size={40} />, delta: data?.comparable ? row.delta : null, dayGain: row.dayGain }))} />}
    <div className={styles.board}>
      <List locale={locale} live={live}>{(ranking) => <FanRows locale={locale} ranking={ranking} metric="hearts" scope={scope} guest={guest} fill={guest ? undefined : LIST_ROWS} />}</List>
      {guest ? <Foot><FootLink href={loginBack(locale)}>{rankingsText(locale, "rkSeeMyRank")}</FootLink></Foot>
        : data?.me ? <Foot><MyRank locale={locale} ranking={data} metric="hearts" /></Foot> : null}
    </div>
  </>;
}

function CreatorPanel({ locale, guest, scope }: { locale: AppLocale; guest: boolean; scope: string }) {
  const live = useLiveRanking(rankingUrl("creators", "hearts", locale, LIST_ROWS), parseCreators);
  const data = live.state.status === "ready" ? live.state.data : null;
  return <>
    <MetricLine locale={locale} computedAt={data?.computedAt ?? null} stale={data?.state === "stale"} />
    {live.state.status === "error" ? null : <RankHighlight locale={locale} loading={!data} rows={(data?.rows ?? []).map((row) => ({ key: row.slug, name: row.name, avatar: <CreatorAvatar slug={row.slug} src={row.imageUrl} size={40} photos={undefined} />, delta: data?.comparable ? row.delta : null, dayGain: row.dayGain }))} />}
    <div className={styles.board}>
      <List locale={locale} live={live}>{(ranking) => <CreatorRows locale={locale} ranking={ranking} metric="hearts" scope={scope} challengeTag guest={guest} fill={guest ? undefined : LIST_ROWS} />}</List>
    </div>
  </>;
}
