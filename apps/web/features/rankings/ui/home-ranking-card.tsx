"use client";
import type { Route } from "next";
import Link from "next/link";
import { useSyncExternalStore } from "react";

import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanTabs } from "@/components/fan-ui/fan-tabs";
import { fanLoginHref } from "@/components/login-href";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import type { AppLocale } from "@/i18n/locales";
import { homeCreatorRankingSchema, homeFanRankingSchema, type HomeCreatorMetric, type HomeCreatorRanking, type HomeFanMetric, type HomeFanRanking } from "../domain/types";
import { rankingsText } from "./rankings-copy";
import {
  CreatorRows, DEFAULT_METRIC, FailedRows, Foot, FootLink, FanRows, LoadingRows, MetricLine, MyRank, rankingUrl, rankingsPageHref, useLiveRanking,
  type Live, type RankingMetric, type RankingsTab,
} from "./ranking-rows";
import styles from "./home-ranking-card.module.css";

export { updatedLabel } from "./ranking-rows";

/** R8-RULE-1: five rows whatever the data holds; a missing row is a quiet placeholder, so the card is the same height with 0, 2 or 20 answers. */
const ROWS = 5;
const parseFans = (value: unknown) => homeFanRankingSchema.parse(value);
const parseCreators = (value: unknown) => homeCreatorRankingSchema.parse(value);

// The narrow card's tab and each tab's metric outlive the card, so coming back to the home keeps what the visitor chose. /rankings keeps its own.
type Choice = { tab: RankingsTab; fans: HomeFanMetric; creators: HomeCreatorMetric };
const initial: Choice = { tab: "fans", fans: DEFAULT_METRIC.fans as HomeFanMetric, creators: DEFAULT_METRIC.creators as HomeCreatorMetric };
let shared: Choice = initial;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const read = () => shared;
const readServer = () => initial;
function choose(next: Partial<Choice>) {
  const merged = { ...shared, ...next };
  if (merged.tab === shared.tab && merged.fans === shared.fans && merged.creators === shared.creators) return;
  shared = merged;
  for (const listener of listeners) listener();
}
/** Tests only: back to the first tab and the default metrics. */
export function resetHomeRankingTab() { shared = initial; }

const at = (live: Live<{ computedAt: string | null }>) => (live.state.status === "ready" ? live.state.data.computedAt : null);

function Body<T extends { computedAt: string | null }>({ locale, live, children }: { locale: AppLocale; live: Live<T>; children: (data: T) => React.ReactNode }) {
  if (live.state.status === "loading") return <><LoadingRows count={ROWS} /><Foot /></>;
  if (live.state.status === "error") return <><FailedRows locale={locale} retry={live.retry} rows={ROWS} /><Foot /></>;
  return <>{children(live.state.data)}</>;
}

function FanBlock({ locale, live, metric, guest, scope }: { locale: AppLocale; live: Live<HomeFanRanking>; metric: HomeFanMetric; guest: boolean; scope: string }) {
  return <>
    <MetricLine locale={locale} tab="fans" metric={metric} computedAt={at(live)} onChange={(next: RankingMetric) => choose({ fans: next as HomeFanMetric })} />
    <Body locale={locale} live={live}>{(data) => <>
      {/* key: a metric change draws its rows afresh (no slide from the other metric's places). */}
      <FanRows compact key={metric} locale={locale} ranking={data} metric={metric} show={ROWS} fill={ROWS} scope={scope} />
      <Foot>{guest
        ? <FootLink href={fanLoginHref(locale, `/?locale=${locale}`) as Route}>{rankingsText(locale, "rkSeeMyRank")}</FootLink>
        : <MyRank locale={locale} ranking={data} metric={metric} />}</Foot>
    </>}</Body>
  </>;
}

function CreatorBlock({ locale, live, metric, guest, scope, showFooterLink = true }: { locale: AppLocale; live: Live<HomeCreatorRanking>; metric: HomeCreatorMetric; guest: boolean; scope: string; showFooterLink?: boolean }) {
  return <>
    <MetricLine locale={locale} tab="creators" metric={metric} computedAt={at(live)} onChange={(next: RankingMetric) => choose({ creators: next as HomeCreatorMetric })} />
    <Body locale={locale} live={live}>{(data) => <>
      <CreatorRows compact key={metric} locale={locale} ranking={data} metric={metric} show={ROWS} fill={ROWS} scope={scope} />
      <Foot>{showFooterLink ? <FootLink href={rankingsPageHref(locale, "creators", metric, guest)}>{rankingsText(locale, "rkViewAll")}</FootLink> : null}</Foot>
    </>}</Body>
  </>;
}

/**
 * The home ranking (261107-2 U3, feedback C3, E2; 7차 R8-RULE-1; ranking stage 2): fans by hearts or points (grade, favorite) and creators by hearts
 * or 찐팬 (the other value, this week's gain), the move since the previous built day, and when the snapshot was written. Five rows on both tabs.
 * Narrow screens draw one card with two tabs; wide screens draw the two rankings as two cards side by side, each with its metric segment.
 * Signed out: the five rows the API gives, and the bottom line asks to sign in for one's own rank. Choices are local state, not the address.
 */
export function HomeRankingCard({ locale, headingId = "home-ranking-heading" }: { locale: AppLocale; headingId?: string }) {
  const auth = useByUsAuth();
  const choice = useSyncExternalStore(subscribe, read, readServer);
  const fans = useLiveRanking(rankingUrl("fans", choice.fans, locale), parseFans);
  const creators = useLiveRanking(rankingUrl("creators", choice.creators, locale), parseCreators);
  const guest = auth.ready && !auth.authenticated;
  const all = (tab: RankingsTab) => <Link className={styles.all} href={rankingsPageHref(locale, tab, tab === "fans" ? choice.fans : choice.creators, guest)}>{rankingsText(locale, "rkViewAll")}<span aria-hidden="true">›</span></Link>;
  const head = (id: string, text: string, tab: RankingsTab | null) => <div className={styles.head}><FanHeading id={id}>{text}</FanHeading>{tab ? all(tab) : null}</div>;
  return <section className={styles.block} aria-labelledby={headingId} data-home-ranking>
    <div className={`${styles.card} ${styles.narrow}`}>
      {head(headingId, rankingsText(locale, "rkTitle"), choice.tab === "fans" ? "fans" : null)}
      <FanTabs variant="segment" panels label={rankingsText(locale, "rkTitle")} current={choice.tab} items={[
        { key: "fans", label: rankingsText(locale, "rkFanTabShort"), onSelect: () => choose({ tab: "fans" }), panel: <div className={styles.panel}><FanBlock locale={locale} live={fans} metric={choice.fans} guest={guest} scope="n" /></div> },
        { key: "creators", label: rankingsText(locale, "rkCreatorTabShort"), onSelect: () => choose({ tab: "creators" }), panel: <div className={styles.panel}><CreatorBlock locale={locale} live={creators} metric={choice.creators} guest={guest} scope="n" /></div> },
      ]} />
    </div>
    <div className={styles.wide}>
      <section className={styles.card} aria-labelledby={`${headingId}-fans`}>
        {head(`${headingId}-fans`, rankingsText(locale, "rkFanTitle"), "fans")}
        <FanBlock locale={locale} live={fans} metric={choice.fans} guest={guest} scope="w" />
      </section>
      <section className={styles.card} aria-labelledby={`${headingId}-creators`}>
        {head(`${headingId}-creators`, rankingsText(locale, "rkCreatorTab"), "creators")}
        <CreatorBlock locale={locale} live={creators} metric={choice.creators} guest={guest} scope="w" showFooterLink={false} />
      </section>
    </div>
  </section>;
}
