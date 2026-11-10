"use client";
import type { Route } from "next";
import Link from "next/link";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanState } from "@/components/fan-ui/fan-state";
import { fanLoginHref } from "@/components/login-href";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import type { AppLocale } from "@/i18n/locales";
import { homeCreatorRankingSchema, homeFanRankingSchema } from "../domain/types";
import { rankingsText } from "./rankings-copy";
import { CreatorRows, FanRows, rankingUrl, rankingsPageHref, updatedLabel, useLiveRanking, type Live } from "./ranking-rows";
import styles from "./home-ranking-card.module.css";

export { updatedLabel } from "./ranking-rows";
const parseFans = (value: unknown) => homeFanRankingSchema.parse(value);
const parseCreators = (value: unknown) => homeCreatorRankingSchema.parse(value);

function Body<T extends { computedAt: string | null; rows: unknown[] }>({ locale, live, children }: { locale: AppLocale; live: Live<T>; children: (data: T) => React.ReactNode }) {
  if (live.state.status === "loading") return <div className={styles.loading} aria-busy="true" />;
  if (live.state.status === "error") return <FanState kind="error" title={rankingsText(locale, "rkError")} actions={<FanAction variant="text" onClick={live.retry}>{rankingsText(locale, "rkRetry")}</FanAction>} />;
  if (!live.state.data.rows.length) return <FanState kind="empty" title={rankingsText(locale, "rkEmpty")} />;
  return children(live.state.data);
}

/** Hearts-only home card. The full leaderboard retains its independent metric choices. */
export function HomeRankingCard({ locale, headingId = "home-ranking-heading" }: { locale: AppLocale; headingId?: string }) {
  const auth = useByUsAuth();
  const fans = useLiveRanking(rankingUrl("fans", "hearts", locale, 10), parseFans);
  const creators = useLiveRanking(rankingUrl("creators", "hearts", locale, 10), parseCreators);
  const guest = !auth.authenticated;
  const login = fanLoginHref(locale, `/?locale=${locale}`) as Route;
  const computedAt = fans.state.status === "ready" ? fans.state.data.computedAt : null;
  const updated = computedAt ? updatedLabel(locale, computedAt, new Date(), "rkHomeUpdated") : null;
  const more = (count: number) => guest && count >= 5 ? <Link className={styles.more} href={login}>{rankingsText(locale, "rkHomeLocked")} <span aria-hidden="true">›</span></Link> : null;
  return <section className={styles.card} aria-labelledby={headingId} data-home-ranking>
    <header className={styles.head}><FanHeading id={headingId}>{rankingsText(locale, "rkHomeTitle")}</FanHeading>{updated ? <time dateTime={computedAt!}>{updated}</time> : null}</header>
    <section aria-labelledby={`${headingId}-fans`}>
      <div className={styles.label}><FanHeading as="h3" id={`${headingId}-fans`}>{rankingsText(locale, "rkHomeFans")}</FanHeading></div>
      <Body locale={locale} live={fans}>{data => <FanRows compact locale={locale} ranking={data} metric="hearts" show={guest ? 5 : 10} scope={headingId} guest={guest} />}</Body>
      {fans.state.status === "ready" ? more(fans.state.data.rows.length) : null}
    </section>
    <section className={styles.creators} aria-labelledby={`${headingId}-creators`}>
      <div className={styles.label}><FanHeading as="h3" id={`${headingId}-creators`}>{rankingsText(locale, "rkCreatorTabShort")}</FanHeading></div>
      <Body locale={locale} live={creators}>{data => <CreatorRows compact locale={locale} ranking={data} metric="hearts" show={guest ? 5 : 10} scope={headingId} />}</Body>
      {creators.state.status === "ready" ? more(creators.state.data.rows.length) : null}
    </section>
    <Link className={styles.all} href={rankingsPageHref(locale, "fans", "hearts", guest)}>{rankingsText(locale, "rkViewAll")} <span aria-hidden="true">›</span></Link>
  </section>;
}
