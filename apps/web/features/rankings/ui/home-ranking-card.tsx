"use client";
import type { Route } from "next";
import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";
import { useState, useSyncExternalStore, type ReactNode } from "react";

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
import { homeCreatorRankingSchema, homeFanRankingSchema, type HomeCreatorRanking, type HomeFanRanking } from "../domain/types";
import { fanAvatar } from "./rankings-content";
import { rankingsText } from "./rankings-copy";
import { RankDelta } from "./rank-delta";
import { useRankingResource } from "./use-ranking-resource";
import styles from "./home-ranking-card.module.css";

/** Ten rows first; "11~20위" opens the next ten inside the card, from the same answer, so the rows below never come from another ranking. */
const ROWS = 10;
const parseFans = (value: unknown) => homeFanRankingSchema.parse(value);
const parseCreators = (value: unknown) => homeCreatorRankingSchema.parse(value);

function Rank({ rank }: { rank: number }) {
  return <span className={styles.rank} data-medal={rank <= 3 ? rank : undefined}>{rank}</span>;
}

function Rows({ children }: { children: ReactNode }) {
  return <ol className={styles.rows}>{children}</ol>;
}
/** Ten rows of the same height while reading, so the card does not jump when the answer comes. */
function Loading() {
  return <Rows>{Array.from({ length: ROWS }, (_, i) => <li key={i} className={styles.row} aria-hidden="true"><FanSkeleton width={20} height={16} /><FanSkeleton shape="circle" width={32} height={32} /><FanSkeleton width="50%" height={16} /></li>)}</Rows>;
}
function Failed({ locale, retry }: { locale: AppLocale; retry: () => void }) {
  return <div className={styles.state}><FanState inline compact kind="error" title={rankingsText(locale, "rkError")} actions={<FanAction variant="text" size="sm" onClick={retry}>{rankingsText(locale, "rkRetry")}</FanAction>} /></div>;
}
function Empty({ title }: { title: string }) {
  return <div className={styles.state}><FanState inline compact kind="empty" title={title} /></div>;
}

function Hearts({ locale, value, className }: { locale: AppLocale; value: number; className?: string }) {
  return <span className={[styles.value, className ?? ""].filter(Boolean).join(" ")} aria-label={rankingsText(locale, "rkHearts", [value.toLocaleString(locale)])}><img src="/images/economy/heart.svg" alt="" width={14} height={14} /><span aria-hidden="true">{value.toLocaleString(locale)}</span></span>;
}

/** Bottom line: the next ten on the left, my rank (or sign in) on the right. */
function Foot({ more, expanded, onToggle, end, locale }: { more: boolean; expanded: boolean; onToggle: () => void; end: ReactNode; locale: AppLocale }) {
  if (!more && !end) return null;
  return <div className={styles.foot}>
    {more ? <button type="button" className={styles.more} aria-expanded={expanded} onClick={onToggle}>{rankingsText(locale, "rkMore1120")}<ChevronDown size={16} aria-hidden="true" data-open={expanded || undefined} /></button> : <span />}
    {end}
  </div>;
}

function FanPanel({ locale, ranking, guestEnd }: { locale: AppLocale; ranking: HomeFanRanking; guestEnd: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  if (ranking.rows.length === 0) return <Empty title={rankingsText(locale, "rkEmptyFans")} />;
  const shown = ranking.rows.slice(0, expanded ? ranking.rows.length : ROWS);
  const me = ranking.me && ranking.me.rank > shown.length ? ranking.me : null;
  const end = me ? <p className={styles.me} role="status"><span>{rankingsText(locale, "rkMyRank")}</span><strong>{rankingsText(locale, "rkRank", [me.rank.toLocaleString(locale)])}</strong><Hearts locale={locale} value={me.score} /></p> : guestEnd;
  return <>
    <Rows>{shown.map((row) => <li key={row.rank} id={`home-rank-fans-${row.rank}`} className={styles.row} data-kind="fans" data-me={row.isMe || undefined} aria-current={row.isMe || undefined}>
      <Rank rank={row.rank} />
      <Avatar avatar={fanAvatar(row.characterId)} imageUrl={null} label="" size={32} />
      <span className={styles.name}>{row.nickname}</span>
      {row.tier ? <span className={styles.tier}><FanTierBadge tier={row.tier} locale={locale} size={16} /><span>{levelLabel(locale, row.tier)}</span></span> : <span className={styles.tier} />}
      <Hearts locale={locale} value={row.score} />
      <RankDelta delta={row.delta} locale={locale} />
    </li>)}</Rows>
    <Foot more={ranking.rows.length > ROWS} expanded={expanded} onToggle={() => setExpanded((open) => !open)} end={end} locale={locale} />
  </>;
}

function CreatorPanel({ locale, ranking }: { locale: AppLocale; ranking: HomeCreatorRanking }) {
  const [expanded, setExpanded] = useState(false);
  if (ranking.rows.length === 0) return <Empty title={rankingsText(locale, "rkEmpty")} />;
  const shown = ranking.rows.slice(0, expanded ? ranking.rows.length : ROWS);
  return <>
    <Rows>{shown.map((row) => <li key={row.slug} id={`home-rank-creators-${row.rank}`}>
      <Link className={styles.row} data-kind="creators" href={`/${row.slug}?locale=${locale}` as Route}>
        <Rank rank={row.rank} />
        <CreatorAvatar slug={row.slug} src={row.imageUrl} size={32} photos={undefined} />
        <span className={styles.name}>{row.name}</span>
        <span className={styles.value}>{rankingsText(locale, "rkJjinfanCount", [row.score.toLocaleString(locale)])}</span>
        <Hearts locale={locale} value={row.hearts} className={styles.wideOnly} />
        <RankDelta delta={row.delta} locale={locale} />
      </Link>
    </li>)}</Rows>
    <Foot more={ranking.rows.length > ROWS} expanded={expanded} onToggle={() => setExpanded((open) => !open)} end={null} locale={locale} />
  </>;
}

function FanTab({ locale, guestEnd }: { locale: AppLocale; guestEnd: ReactNode }) {
  const { state, retry } = useRankingResource("/api/rankings/home?kind=fans", parseFans);
  if (state.status === "loading") return <Loading />;
  if (state.status === "error") return <Failed locale={locale} retry={retry} />;
  return <FanPanel locale={locale} ranking={state.data} guestEnd={guestEnd} />;
}

function CreatorTab({ locale }: { locale: AppLocale }) {
  const { state, retry } = useRankingResource(`/api/rankings/home?kind=creators&locale=${locale}`, parseCreators);
  if (state.status === "loading") return <Loading />;
  if (state.status === "error") return <Failed locale={locale} retry={retry} />;
  return <CreatorPanel locale={locale} ranking={state.data} />;
}

// The home draws this card twice (narrow and wide columns, one hidden by CSS). Both copies read one tab choice, so pressing either one never leaves the visible copy on the other tab.
let sharedTab = "fans";
const tabListeners = new Set<() => void>();
const subscribeTab = (listener: () => void) => { tabListeners.add(listener); return () => { tabListeners.delete(listener); }; };
const readTab = () => sharedTab;
const readServerTab = () => "fans";
function chooseTab(next: string) { if (next === sharedTab) return; sharedTab = next; for (const listener of tabListeners) listener(); }
/** Tests only: back to the first tab. */
export function resetHomeRankingTab() { sharedTab = "fans"; }

/**
 * The home ranking (261107-2 U3, feedback C3): true fans by all-time hearts and creators by true fans, with the move since yesterday.
 * Public for everyone; signed out, the bottom line asks to sign in for one's own rank. The tab is local state, not the address, so the home never moves.
 */
export function HomeRankingCard({ locale, headingId = "home-ranking-heading" }: { locale: AppLocale; headingId?: string }) {
  const auth = useByUsAuth();
  const tab = useSyncExternalStore(subscribeTab, readTab, readServerTab);
  const guestEnd = auth.ready && !auth.authenticated ? <Link className={styles.login} href={fanLoginHref(locale, `/?locale=${locale}`)}>{rankingsText(locale, "rkSeeMyRank")}<ArrowRight size={16} aria-hidden="true" /></Link> : null;
  return <section className={styles.card} aria-labelledby={headingId} data-home-ranking>
    <div className={styles.head}>
      <div className={styles.title}><FanHeading id={headingId}>{rankingsText(locale, "rkTitle")}</FanHeading><span className={styles.period}>{rankingsText(locale, tab === "creators" ? "rkCumulativeFans" : "rkCumulativeHearts")}</span></div>
      <Link className={styles.all} href={`/rankings?locale=${locale}&tab=${tab}` as Route}>{rankingsText(locale, "rkViewAll")}<ArrowRight size={16} aria-hidden="true" /></Link>
    </div>
    <FanTabs variant="segment" panels label={rankingsText(locale, "rkTitle")} current={tab} items={[
      { key: "fans", label: rankingsText(locale, "rkFanTab"), onSelect: () => chooseTab("fans"), panel: <FanTab locale={locale} guestEnd={guestEnd} /> },
      { key: "creators", label: rankingsText(locale, "rkCreatorRankTab"), onSelect: () => chooseTab("creators"), panel: <CreatorTab locale={locale} /> },
    ]} />
  </section>;
}
