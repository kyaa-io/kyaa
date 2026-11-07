"use client";
import { useState, type FormEvent } from "react";
import { Trophy, UsersRound } from "lucide-react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanLockedRows } from "@/components/fan-ui/fan-locked-value";
import { FanSkeletonRows } from "@/components/fan-ui/fan-skeleton";
import { fanLoginHref } from "@/components/login-href";
import { jjinfanChallengeSchema, type PageRanking } from "@/features/rankings/domain/types";
import { AsOf, Empty, FanRankingList, JjinfanProgress } from "@/features/rankings/ui/rankings-content";
import { useRankingResource } from "@/features/rankings/ui/use-ranking-resource";
import type { AppLocale } from "@/i18n/locales";
import { groupPublicPeopleHeartsSchema, groupPublicRankingSchema, type GroupPeopleMode } from "@/server/group-members/domain";
import { groupMembersCopy } from "./group-members-copy";
import { GroupPersonGrade, GroupPersonRow } from "./group-person-row";
import { useGroupResource } from "./use-group-resource";
import styles from "./group-members.module.css";

const parsePeople = (value: unknown) => groupPublicPeopleHeartsSchema.parse(value);
const parseRanking = (value: unknown) => groupPublicRankingSchema.parse(value);
const parseChallenge = (value: unknown) => jjinfanChallengeSchema.parse(value);
type Row = ReturnType<typeof parsePeople>["items"][number];

function PublicFans({ pageId, locale, returnTo, onJoin, joinPending, joinLabel }: Readonly<{ pageId: string; locale: AppLocale; returnTo: string; onJoin?: () => void; joinPending: boolean; joinLabel?: string }>) {
  const t = groupMembersCopy(locale), [offset, setOffset] = useState(0), [previous, setPrevious] = useState<Row[]>([]);
  const query = new URLSearchParams({ locale, limit: "30", hearts: "1" });
  if (offset) query.set("offset", String(offset));
  const resource = useGroupResource(`/api/groups/${pageId}/public-people?${query}`, parsePeople), rows = [...previous, ...(resource.data?.items ?? [])];
  const toLogin = (event: FormEvent) => { event.preventDefault(); window.location.assign(fanLoginHref(locale, returnTo)); };
  return <div className={styles.body}>
    {!resource.authenticated && <form className={styles.search} onSubmit={toLogin}><label className={styles.searchField}><input className={styles.input} type="search" maxLength={100} placeholder={t.search} aria-label={t.search}/></label><FanAction type="submit">{t.find}</FanAction></form>}
    {resource.error ? <div className={styles.state} role="alert"><p>{t.error}</p><FanAction onClick={resource.retry}>{t.retry}</FanAction></div>
      : rows.length ? <ul className={styles.list} aria-busy={resource.loading || undefined}>{rows.map((row, index) => <GroupPersonRow key={index} nickname={row.nickname} avatarUrl={row.avatarUrl} meta={row.tier ? <GroupPersonGrade tier={row.tier} hearts={row.hearts} locale={locale}/> : t.member}/>)}</ul>
      : resource.loading ? <FanSkeletonRows rows={6} variant="member" className={styles.skeleton}/>
      : <div className={styles.state}><UsersRound size={32} aria-hidden="true"/><p>{t.join}</p>{resource.authenticated && onJoin && joinLabel && <FanAction disabled={joinPending} onClick={onJoin}>{joinLabel}</FanAction>}</div>}
    {resource.data?.nextOffset && <FanAction className={styles.more} disabled={resource.loading} onClick={() => { setPrevious(rows); setOffset(resource.data!.nextOffset!); }}>{t.more}</FanAction>}
  </div>;
}

function PublicRanking({ pageId, slug, locale }: Readonly<{ pageId: string; slug: string; locale: AppLocale }>) {
  const t = groupMembersCopy(locale), ranking = useGroupResource(`/api/groups/${pageId}/public-ranking`, parseRanking), challenge = useRankingResource(`/api/pages/${encodeURIComponent(slug)}/jjinfan-challenge`, parseChallenge);
  const shown: PageRanking | undefined = ranking.data && { metric: "hearts", period: "all", periodStart: "", computedAt: ranking.data.computedAt, rows: ranking.data.rows.map(row => ({ ...row, isMe: false })), me: null };
  return <div className={styles.body}>
    {challenge.state.status === "ready" && <JjinfanProgress locale={locale} count={challenge.state.data.count} target={challenge.state.data.target}/>}
    {ranking.error ? <div className={styles.state} role="alert"><p>{t.error}</p><FanAction onClick={ranking.retry}>{t.retry}</FanAction></div>
      : !shown ? <FanSkeletonRows rows={6} variant="member" className={styles.rankSkeleton}/>
      : ranking.data?.available === false ? <div className={styles.state}><Trophy size={32} aria-hidden="true"/><p>{t.threshold}</p></div>
      : shown.rows.length ? <><AsOf locale={locale} computedAt={shown.computedAt}/><FanRankingList locale={locale} ranking={shown}/></> : <Empty locale={locale}/>}
  </div>;
}

/** 가입하지 않은 사람이 보는 팬·랭킹 탭. 구성원 API는 부르지 않는다. */
export function GroupPublicPeople({ mode, pageId, slug, locale, authenticated, onJoin, joinPending = false, joinLabel }: Readonly<{ mode: GroupPeopleMode; pageId: string; slug?: string | null; locale: AppLocale; authenticated: boolean; onJoin?: () => void; joinPending?: boolean; joinLabel?: string }>) {
  const t = groupMembersCopy(locale);
  const returnTo = slug ? `/${encodeURIComponent(slug)}?locale=${locale}&tab=members` : `/pages/groups/${pageId}?tab=members&locale=${locale}`;
  if (mode === "members") return <PublicFans pageId={pageId} locale={locale} returnTo={returnTo} onJoin={onJoin} joinPending={joinPending} joinLabel={joinLabel}/>;
  if (mode === "ranking") return slug ? <PublicRanking pageId={pageId} slug={slug} locale={locale}/> : <div className={styles.state}><UsersRound size={32} aria-hidden="true"/><p>{t.creatorRequired}</p></div>;
  if (!authenticated) return <div className={styles.lockedFriends}><FanLockedRows rows={3}/><FanAction variant="neutral" href={fanLoginHref(locale, returnTo)}>{t.login}</FanAction></div>;
  return <div className={styles.state}><UsersRound size={32} aria-hidden="true"/><p>{t.join}</p>{onJoin && joinLabel && <FanAction disabled={joinPending} onClick={onJoin}>{joinLabel}</FanAction>}</div>;
}
