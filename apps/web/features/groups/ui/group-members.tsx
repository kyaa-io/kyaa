"use client";
import { SortedFans } from "./sorted-fans";
import { fanListCopy } from "./fan-list-copy";
import { rankingsText } from "@/features/rankings/ui/rankings-copy";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowRight, Search, Trophy, UsersRound } from "lucide-react";
import type { AppLocale } from "@/i18n/locales";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanSkeletonRows } from "@/components/fan-ui/fan-skeleton";
import { FanTabs } from "@/components/fan-ui/fan-tabs";
import { ProfileModal, type ProfileModalPerson } from "@/features/group-social/profile-modal";
import { reachText } from "@/features/group-social/reach-copy";
import { pageRankingSchema } from "@/features/rankings/domain/types";
import { useRankingResource } from "@/features/rankings/ui/use-ranking-resource";
import { JjinfanGauge } from "@/features/rankings/ui/jjinfan-gauge";
import { groupPeopleSchema, type GroupPeopleMode } from "@/server/group-members/domain";
import { useGroupResource } from "./use-group-resource";
import { GroupPersonHearts, GroupPersonRow, GroupPersonTier } from "./group-person-row";
import { fanProfileText } from "@/features/fan-profile/fan-profile-copy";
import { GroupPublicPeople } from "./group-public-people";
import { groupMembersCopy } from "./group-members-copy";
import { RoleBadge, pageRoleOf, type PageRole } from "./role-badge";
import { useOptionalGroupPage } from "./group-page-context";
import styles from "./group-members.module.css";

const parse = (value: unknown) => groupPeopleSchema.parse(value);
const parseRanking = (value: unknown) => pageRankingSchema.parse(value);
type Row = ReturnType<typeof parse>["items"][number];
export type GroupMembersPresentation = { overview?: ReactNode; creatorName: string; subtitles: Record<string, string>; selectedProfileId?: string };

/**
 * Second line of a fan row (261107-2 design-r4 7.1): the role for people who run the page, then the chosen favorite,
 * points and stamps on this page. A missing favorite is left out; 0 points and 0 stamps stay, so rows compare.
 * Pages without grades show the role alone.
 */
function personMeta(row: Row, t: ReturnType<typeof groupMembersCopy>, locale: AppLocale) {
  // 소유자·운영진은 이름 옆 역할 배지가 맡는다(피드백 I ⑤). 같은 말을 둘째 줄에 다시 쓰지 않는다.
  if (!row.tier) return row.role === "member" ? t.member : undefined;
  const parts = [
    row.favorite ? fanProfileText(locale, "profFavorite", [row.favorite.name]) : null,
    row.fanPoints == null ? null : fanProfileText(locale, "profPointsValue", [row.fanPoints.toLocaleString(locale)]),
    row.stamps == null ? null : fanProfileText(locale, "rowStamps", [row.stamps.toLocaleString(locale)]),
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : undefined;
}

/** 이름 옆: 역할 배지(아티스트·운영자) 1개 + 등급. */
function RowBadges({ role, tier, locale }: { role: PageRole | null; tier?: string | null; locale: AppLocale }) {
  if (!role && !tier) return null;
  return <>{role ? <RoleBadge role={role} locale={locale}/> : null}{tier ? <GroupPersonTier tier={tier} locale={locale}/> : null}</>;
}

/** The viewer's own rank when it is below the list. The people API has no "me", so this reads the signed-in page ranking. */
function MyRankRow({ slug, locale, listed }: { slug: string; locale: AppLocale; listed: boolean }) {
  const t = groupMembersCopy(locale), { state } = useRankingResource(`/api/pages/${encodeURIComponent(slug)}/rankings?metric=hearts&period=all`, parseRanking);
  const me = state.status === "ready" ? state.data.me : null;
  if (!listed || !me || me.inTop) return null;
  return <div className={styles.myRank}><span className={styles.rank}>{me.rank}</span><strong>{reachText(locale, "myRank")}</strong><strong className={styles.score}>{me.score.toLocaleString(locale)}{locale === "ko" ? " 점" : ""}</strong><span className={styles.visuallyHidden}>{t.scoreColumn}</span></div>;
}

export function GroupMembers({ pageId, locale, member, presentation, inTab = false, onJoin, joinPending = false, joinLabel, rankingsSlug, gaugeAbove = false }: { rankingsSlug?: string | null; /** The caller draws the 찐팬 100 gauge above, outside its own loading state. */ gaugeAbove?: boolean; pageId: string; locale: AppLocale; member: boolean; presentation?: GroupMembersPresentation; inTab?: boolean; onJoin?: () => void; joinPending?: boolean; joinLabel?: string }) {
  const t = { ...groupMembersCopy(locale), ...fanListCopy(locale) };
  const presence = useOptionalGroupPage()?.presence.data;
  const artistIds = useMemo(() => new Set(presence?.artists.map((artist) => artist.profileId) ?? []), [presence]);
  const [mode, setMode] = useState<GroupPeopleMode>("members"), [draft, setDraft] = useState(""), [search, setSearch] = useState(""), [cursor, setCursor] = useState<string>(), [previous, setPrevious] = useState<Row[]>([]);
  const [settled, setSettled] = useState<{ mode: GroupPeopleMode; rows: Row[] }>(), [opened, setOpened] = useState<ProfileModalPerson | null>(null);
  // /rankings/[slug] moved here: that address opens this tab on the ranking.
  useEffect(() => { if (new URLSearchParams(window.location.search).get("people") === "ranking") setMode("ranking"); }, []);
  const query = new URLSearchParams({ mode, search, locale, limit: "30" });
  if (cursor) query.set("cursor", cursor);
  const resource = useGroupResource(member && mode === "ranking" ? `/api/groups/${pageId}/people?${query}` : null, parse);
  const rows = useMemo(() => [...previous, ...(resource.data?.items ?? [])], [previous, resource.data]);
  useEffect(() => { if (resource.data) setSettled({ mode, rows }); }, [resource.data, mode, rows]);
  // Keep the list on screen while the next search or page loads. Only a first load shows the skeleton.
  const shown = resource.data ? rows : settled?.mode === mode ? settled.rows : previous;
  const reset = () => { setPrevious([]); setCursor(undefined); };
  const choose = (next: GroupPeopleMode) => { setMode(next); reset(); setDraft(""); setSearch(""); };
  useEffect(() => {
    const timer = setTimeout(() => { setSearch(draft.trim()); setPrevious([]); setCursor(undefined); }, 250);
    return () => clearTimeout(timer);
  }, [draft]);
  const ranking = resource.data?.ranking;
  const hideSearch = mode === "ranking" || (mode === "friends" && !member);
  const modeTitle = mode === "ranking" ? `${presentation?.creatorName ?? ""} ${t.ranking}`.trim() : mode === "friends" ? t.friendsHere : null;

  return <section className={styles.section} data-member-mode={mode} aria-labelledby="group-people-title">
    <h2 id="group-people-title" className={inTab ? styles.visuallyHidden : styles.title}>{t.title}</h2>
    {presentation?.overview && mode !== "ranking" && <div className={styles.overview}>{presentation.overview}</div>}
    {rankingsSlug && !gaugeAbove && <JjinfanGauge slug={rankingsSlug} locale={locale} name={presentation?.creatorName}/>}
    <div className={styles.toolbar}>
      <FanTabs variant="chip" label={t.title} current={mode} className={styles.tabs} items={(["members", "jjinfans", "friends", "ranking"] as const).map(key => ({ key, label: t[key], onSelect: () => choose(key) }))}/>
      {!hideSearch && <label className={styles.searchField}><Search size={18} aria-hidden="true"/><input className={styles.input} type="search" value={draft} onChange={event => setDraft(event.target.value)} maxLength={100} placeholder={t.search} aria-label={t.search}/></label>}
    </div>
    {mode !== "ranking" && (member || mode !== "friends") ? <SortedFans key={`${pageId}:${resource.ownerKey}`} pageId={pageId} mode={mode} search={search} locale={locale}/> : !member ? <GroupPublicPeople mode={mode} pageId={pageId} slug={rankingsSlug} locale={locale} authenticated={resource.authenticated} onJoin={onJoin} joinPending={joinPending} joinLabel={joinLabel}/> : <div className={styles.body}>
      {modeTitle && <div className={styles.modeHead}><h3 className={styles.modeTitle}>{modeTitle}</h3>{mode === "ranking" && <p className={styles.scope}>{t.topScope}</p>}</div>}
      {resource.error ? <div className={styles.state} role="alert"><p>{t.error}</p><FanAction onClick={resource.retry}>{t.retry}</FanAction></div>
        : shown.length ? <ul className={`${styles.list} ${mode === "ranking" ? styles.rankingList : ""}`} aria-busy={resource.loading || undefined}>{shown.map(row => <GroupPersonRow key={row.profileId} nickname={row.nickname} avatarUrl={row.avatarUrl} rank={row.rank} rankLabel={row.rank === null ? undefined : `${t.ranking} ${row.rank}`} badge={<RowBadges role={pageRoleOf(row, artistIds)} tier={row.tier} locale={locale}/>} meta={personMeta(row, t, locale)} score={mode === "ranking" && row.points !== null ? `${row.points.toLocaleString(locale)}${locale === "ko" ? " 점" : ""}` : row.hearts != null ? <GroupPersonHearts hearts={row.hearts} locale={locale}/> : undefined} selected={presentation?.selectedProfileId === row.profileId} onOpen={() => setOpened({ profileId: row.profileId, nickname: row.nickname, avatarUrl: row.avatarUrl, tier: row.tier, pageId })}/>)}</ul>
        : resource.loading ? <FanSkeletonRows rows={6} variant="member" className={styles.skeleton}/>
        : <div className={styles.state}>{mode === "ranking" ? <Trophy size={32} aria-hidden="true"/> : <UsersRound size={32} aria-hidden="true"/>}<p>{mode === "ranking" && ranking && !ranking.available ? t[ranking.reason === "creator_required" ? "creatorRequired" : "threshold"] : mode === "friends" && !search ? t.noFriends : t.empty}</p>{mode === "friends" && !search && <FanAction href={`/my/friends?locale=${locale}`} trailingIcon={<ArrowRight size={18}/>}>{t.manageFriends}</FanAction>}</div>}
      {mode === "ranking" && rankingsSlug && <MyRankRow slug={rankingsSlug} locale={locale} listed={shown.length > 0}/>}
      {resource.data?.nextCursor && <FanAction className={styles.more} disabled={resource.loading} onClick={() => { setPrevious(rows); setCursor(resource.data!.nextCursor!); }}>{mode === "members" ? t.memberMore : t.more}</FanAction>}
      {mode === "friends" && shown.length > 0 && <FanAction className={styles.more} variant="text" href={`/my/friends?locale=${locale}`} trailingIcon={<ArrowRight size={18}/>}>{t.manageFriends}</FanAction>}
      {mode === "ranking" && rankingsSlug && <FanAction className={styles.more} variant="text" trailingIcon={<ArrowRight size={18}/>} href={`/rankings/${encodeURIComponent(rankingsSlug)}?locale=${locale}`}>{rankingsText(locale, "rkFanTitle")}</FanAction>}
    </div>}
    {opened && <ProfileModal key={opened.profileId} person={opened} locale={locale} onClose={() => setOpened(null)}/>}
  </section>;
}
