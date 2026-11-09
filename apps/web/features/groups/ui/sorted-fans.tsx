"use client";
import { useEffect, useMemo, useState } from "react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanSkeletonRows } from "@/components/fan-ui/fan-skeleton";
import type { AppLocale } from "@/i18n/locales";
import { fanProfileText } from "@/features/fan-profile/fan-profile-copy";
import { sortedFansSchema, type SortedFanMode } from "@/server/group-members/sorted-domain";
import { GroupPersonHearts, GroupPersonRow, GroupPersonTier } from "./group-person-row";
import { groupMembersCopy } from "./group-members-copy";
import { fanListCopy } from "./fan-list-copy";
import { fanListTime } from "./fan-list-time";
import { useGroupResource } from "./use-group-resource";
import styles from "./group-members.module.css";

const parse = (value: unknown) => sortedFansSchema.parse(value);
type Row = ReturnType<typeof parse>["items"][number];

export function SortedFans({ pageId, mode, search, locale }: { pageId: string; mode: SortedFanMode; search: string; locale: AppLocale }) {
  const t = groupMembersCopy(locale), copy = fanListCopy(locale);
  const [page, setPage] = useState<{ scope: string; cursor?: string; previous: Row[] }>();
  const scope = JSON.stringify([pageId, mode, search, locale]);
  const activePage = page?.scope === scope ? page : undefined;
  const query = new URLSearchParams({ sort: "hearts", mode, search, locale, limit: "30" });
  if (activePage?.cursor) query.set("cursor", activePage.cursor);
  const resource = useGroupResource(`/api/groups/${pageId}/public-people?${query}`, parse);
  const rows = useMemo(() => [...(activePage?.previous ?? []), ...(resource.data?.items ?? [])], [activePage, resource.data]);
  const [settled, setSettled] = useState<{ pageId: string; mode: SortedFanMode; rows: Row[] }>();
  useEffect(() => { if (resource.data) setSettled({ pageId, mode, rows }); }, [pageId, mode, rows, resource.data]);
  const shown = resource.data ? rows : settled?.pageId === pageId && settled.mode === mode ? settled.rows : [];
  return <div className={styles.body} data-sorted-fans>
    <div className={styles.listHead}><span>{copy.order}</span></div>
    {resource.error ? <div className={styles.state} role="alert"><p>{t.error}</p><FanAction variant="text" onClick={resource.retry}>{t.retry}</FanAction></div>
      : shown.length ? <ul className={styles.list} aria-busy={resource.loading || undefined}>{shown.map((row, index) => <GroupPersonRow
        key={index} nickname={row.nickname} avatarUrl={row.avatarUrl}
        badge={row.tier ? <GroupPersonTier tier={row.tier} locale={locale}/> : undefined}
        meta={<>{fanProfileText(locale, "rowStamps", [row.stamps.toLocaleString(locale)])}{row.hearts > 0 && row.first_jjinfan_at && <> · <time dateTime={row.first_jjinfan_at}>{copy.since.replace("{0}", fanListTime(row.first_jjinfan_at, locale))}</time></> }</>}
        score={<GroupPersonHearts hearts={row.hearts} locale={locale}/>}
      />)}</ul>
      : resource.loading ? <FanSkeletonRows rows={6} variant="member" className={styles.skeleton}/>
      : <div className={styles.empty} role="status">{mode === "friends" && !search ? t.noFriends : t.empty}</div>}
    {resource.data?.nextCursor && <FanAction className={styles.more} disabled={resource.loading} onClick={() => setPage({ scope, cursor: resource.data!.nextCursor!, previous: rows })}>{t.memberMore}</FanAction>}
  </div>;
}
