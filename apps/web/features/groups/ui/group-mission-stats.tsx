"use client";
import { useState } from "react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanTabs } from "@/components/fan-ui";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanSkeletonRows } from "@/components/fan-ui/fan-skeleton";
import type { AppLocale } from "@/i18n/locales";
import { groupMissionStatsSchema } from "../domain/operator-tools";
import { groupsCopy } from "./copy";
import { manageFormText } from "./manage-form-copy";
import { operatorToolsCopy, withCount } from "./operator-tools-copy";
import { useGroupResource } from "./use-group-resource";
import own from "./group-operator-members.module.css";

const parse = (value: unknown) => groupMissionStatsSchema.parse(value);
const PERIODS = [7, 30, 90] as const;
const DAY = 24 * 60 * 60 * 1000, KST = 9 * 60 * 60 * 1000;
/** 오늘(KST)까지 n일. 서버 최대 92일 안. */
export function missionStatsRange(days: number, now = Date.now()) {
  const to = new Date(now + KST), from = new Date(to.getTime() - (days - 1) * DAY);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

/** 운영 관리 미션 탭 위의 미션 현황 표. 행을 누르면 그 미션의 검토 목록으로 간다. */
export function GroupMissionStats({ pageId, locale }: { pageId: string; locale: AppLocale }) {
  const t = groupsCopy(locale), o = operatorToolsCopy(locale), [days, setDays] = useState<(typeof PERIODS)[number]>(7);
  const range = missionStatsRange(days), r = useGroupResource(`/api/groups/${pageId}/mission-stats?${new URLSearchParams(range)}`, parse);
  const kind = { text: manageFormText(locale, "kindText"), photo: manageFormText(locale, "kindPhoto"), survey: manageFormText(locale, "kindSurvey") } as const;
  const n = (value: number) => value.toLocaleString(locale);
  const d = r.data, empty = d && !d.items.length && !d.attendance;
  return <section className={own.section} aria-labelledby="mission-stats-title">
    <div className={own.head}><FanHeading id="mission-stats-title">{o.statsTitle}</FanHeading></div>
    <div className={own.filters}><FanTabs variant="chip" className={own.chips} label={o.statsTitle} current={String(days)} items={PERIODS.map(value => ({ key: String(value), label: withCount(o.days, value, locale), onSelect: () => setDays(value) }))} /></div>
    {r.error ? <div role="alert"><p className={own.alert}>{t.error}</p><FanAction variant="text" onClick={r.retry}>{t.retry}</FanAction></div>
      : !d ? <FanSkeletonRows rows={3} variant="plain" ariaLabel={t.loading} />
      : empty ? <p role="status" className={own.status}>{o.statsEmpty}</p>
      : <div className={own.viewport}><table className={own.table}>
        <thead><tr><th scope="col">{o.mission}</th><th scope="col" className={own.num}>{o.participants}</th><th scope="col" className={own.num}>{o.pending}</th><th scope="col" className={own.num}>{o.approved}</th><th scope="col" className={own.num}>{o.rejected}</th><th scope="col">{o.kind}</th><th scope="col" aria-label={o.review} /></tr></thead>
        <tbody>
          {d.attendance && <tr><td data-cell="head"><strong>{o.dailyCheer}</strong></td><td data-label={o.participants} className={own.num}>{n(d.attendance.participants)}</td><td data-label={o.pending} className={own.num}>—</td><td data-label={o.approved} className={own.num}>—</td><td data-label={o.rejected} className={own.num}>—</td><td data-label={o.kind}>—</td><td /></tr>}
          {d.items.map(item => <tr key={item.missionId}><td data-cell="head"><strong>{item.title}</strong></td><td data-label={o.participants} className={own.num}>{n(item.participants)}</td><td data-label={o.pending} className={own.num}>{n(item.pending)}</td><td data-label={o.approved} className={own.num}>{n(item.approved)}</td><td data-label={o.rejected} className={own.num}>{n(item.rejected)}</td><td data-label={o.kind}>{kind[item.submissionKind]}</td><td><FanAction variant="text" size="sm" href={`/pages/groups/${pageId}/missions/${item.missionId}?locale=${locale}`}>{o.review}</FanAction></td></tr>)}
        </tbody>
      </table></div>}
  </section>;
}
