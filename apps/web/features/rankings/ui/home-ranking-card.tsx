"use client";
import type { Route } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useState, type ReactNode } from "react";

import { FanAction } from "@/components/fan-ui/fan-action";
import { CreatorAvatar } from "@/components/fan-ui/creator-avatar";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { FanState } from "@/components/fan-ui/fan-state";
import { FanTabs } from "@/components/fan-ui/fan-tabs";
import { fanLoginHref } from "@/components/login-href";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { levelLabel } from "@/features/passport/domain/passport-read-model";
import { Avatar } from "@/features/profile/ui/avatar";
import { FanTierBadge } from "@/features/rewards/ui/fan-tier-badge";
import type { AppLocale } from "@/i18n/locales";
import { creatorRankingSchema, platformFanRankingSchema, type CreatorRanking, type PlatformFanRanking } from "../domain/types";
import { fanAvatar } from "./rankings-content";
import { rankingsText } from "./rankings-copy";
import { useRankingResource } from "./use-ranking-resource";
import styles from "./home-ranking-card.module.css";

const ROWS = 5;
const parseFans = (value: unknown) => platformFanRankingSchema.parse(value);
const parseCreators = (value: unknown) => creatorRankingSchema.parse(value);

function Rank({ rank }: { rank: number }) {
  return <span className={styles.rank} data-medal={rank <= 3 ? rank : undefined}>{rank}</span>;
}

/** Five rows of the same height while reading, so the card does not jump when the answer comes. */
function Rows({ children }: { children: ReactNode }) {
  return <ol className={styles.rows}>{children}</ol>;
}
function Loading() {
  return <Rows>{Array.from({ length: ROWS }, (_, i) => <li key={i} className={styles.row} aria-hidden="true"><FanSkeleton width={20} height={16} /><FanSkeleton shape="circle" width={32} height={32} /><FanSkeleton width="50%" height={16} /></li>)}</Rows>;
}
function Failed({ locale, retry }: { locale: AppLocale; retry: () => void }) {
  return <FanState inline compact kind="error" title={rankingsText(locale, "rkError")} actions={<FanAction variant="text" size="sm" onClick={retry}>{rankingsText(locale, "rkRetry")}</FanAction>} />;
}
function Empty({ locale }: { locale: AppLocale }) {
  return <FanState inline compact kind="empty" title={rankingsText(locale, "rkEmpty")} />;
}

function Hearts({ locale, value }: { locale: AppLocale; value: number }) {
  return <span className={styles.value} aria-label={rankingsText(locale, "rkHearts", [value.toLocaleString(locale)])}><img src="/images/economy/heart.svg" alt="" width={14} height={14} /><span aria-hidden="true">{value.toLocaleString(locale)}</span></span>;
}

function FanRows({ locale, ranking }: { locale: AppLocale; ranking: PlatformFanRanking }) {
  if (ranking.rows.length === 0) return <Empty locale={locale} />;
  return <Rows>{ranking.rows.slice(0, ROWS).map((row) => <li key={row.rank} className={styles.row} data-me={row.isMe || undefined} aria-current={row.isMe || undefined}>
    <Rank rank={row.rank} />
    <Avatar avatar={fanAvatar(row.characterId)} imageUrl={null} label="" size={32} />
    <span className={styles.name}>{row.nickname}</span>
    {row.tier ? <span className={styles.tier}><FanTierBadge tier={row.tier} locale={locale} size={16} /><span>{levelLabel(locale, row.tier)}</span></span> : null}
    <Hearts locale={locale} value={row.score} />
  </li>)}</Rows>;
}

function CreatorRows({ locale, ranking }: { locale: AppLocale; ranking: CreatorRanking }) {
  if (ranking.rows.length === 0) return <Empty locale={locale} />;
  return <Rows>{ranking.rows.slice(0, ROWS).map((row) => <li key={row.slug}>
    <Link className={styles.row} href={`/${row.slug}?locale=${locale}` as Route}>
      <Rank rank={row.rank} />
      <CreatorAvatar slug={row.slug} src={row.imageUrl} size={32} photos={undefined} />
      <span className={styles.name}>{row.name}</span>
      <span className={styles.value}>{rankingsText(locale, "rkFans", [row.score.toLocaleString(locale)])}</span>
    </Link>
  </li>)}</Rows>;
}

function FanPanel({ locale }: { locale: AppLocale }) {
  const { state, retry } = useRankingResource(`/api/rankings/fans?period=week&limit=${ROWS}`, parseFans);
  if (state.status === "loading") return <Loading />;
  if (state.status === "error") return <Failed locale={locale} retry={retry} />;
  const me = state.data.me;
  return <><FanRows locale={locale} ranking={state.data} />{me && !me.inTop ? <p className={styles.me} role="status"><span>{rankingsText(locale, "rkMyRank")}</span><strong>{rankingsText(locale, "rkRank", [me.rank.toLocaleString(locale)])}</strong><Hearts locale={locale} value={me.score} /></p> : null}</>;
}

function CreatorPanel({ locale }: { locale: AppLocale }) {
  const { state, retry } = useRankingResource(`/api/rankings/creators?metric=fans&limit=${ROWS}&locale=${locale}`, parseCreators);
  if (state.status === "loading") return <Loading />;
  if (state.status === "error") return <Failed locale={locale} retry={retry} />;
  return <CreatorRows locale={locale} ranking={state.data} />;
}

/**
 * The home card in the old "my fan activity" place (261107-2 U3, decision D3): platform fan ranking (hearts, this week) and creators by fan count.
 * Public for everyone; signed out, the last line asks to sign in for one's own rank. The tab is local state, not the address, so the home never moves.
 */
export function HomeRankingCard({ locale, headingId = "home-ranking-heading" }: { locale: AppLocale; headingId?: string }) {
  const auth = useByUsAuth();
  const [tab, setTab] = useState("fans");
  return <section className={styles.card} aria-labelledby={headingId} data-home-ranking>
    <div className={styles.head}>
      <div className={styles.title}><FanHeading id={headingId}>{rankingsText(locale, "rkTitle")}</FanHeading><span className={styles.period}>{rankingsText(locale, "rkWeek")}</span></div>
      <Link className={styles.all} href={`/rankings?locale=${locale}&tab=${tab}` as Route}>{rankingsText(locale, "rkViewAll")}<ArrowRight size={16} aria-hidden="true" /></Link>
    </div>
    <FanTabs variant="segment" panels label={rankingsText(locale, "rkTitle")} current={tab} items={[
      { key: "fans", label: rankingsText(locale, "rkFanTitle"), onSelect: () => setTab("fans"), panel: <FanPanel locale={locale} /> },
      { key: "creators", label: rankingsText(locale, "rkCreatorTab"), onSelect: () => setTab("creators"), panel: <CreatorPanel locale={locale} /> },
    ]} />
    {auth.ready && !auth.authenticated && tab === "fans" ? <Link className={styles.login} href={fanLoginHref(locale, `/?locale=${locale}`)}>{rankingsText(locale, "rkSeeMyRank")}<ArrowRight size={16} aria-hidden="true" /></Link> : null}
  </section>;
}
