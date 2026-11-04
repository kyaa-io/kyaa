"use client";

import { NoticeManager } from "@/components/admin/notice-manager";
import { ScheduleManagerBody } from "@/components/admin/schedule-manager";
import styles from "@/components/admin/operations.module.css";
import { OperatorFrame, operatorChannelName } from "./operator-shell";

export function OperatorNotices({ channelId, locale }: { channelId: string; locale: "ko" | "en" }) {
  return <OperatorFrame locale={locale} channelId={channelId}>{(session, channel) => channel && <>
    <div className={styles.pageHeading}><p>{operatorChannelName(channel, locale)}</p><h1>{locale === "ko" ? "공지" : "Notices"}</h1></div>
    <NoticeManager celebrityId={channel.id} celebrityName={operatorChannelName(channel, locale)} role={session.role} locale={locale} apiBase="/api/operator/channels" />
  </>}</OperatorFrame>;
}

export function OperatorSchedules({ channelId, locale }: { channelId: string; locale: "ko" | "en" }) {
  return <OperatorFrame locale={locale} channelId={channelId}>{(session, channel) => channel && <>
    <div className={styles.pageHeading}><p>{operatorChannelName(channel, locale)}</p><h1>{locale === "ko" ? "공식 일정" : "Official schedule"}</h1></div>
    <ScheduleManagerBody locale={locale} role={session.role} endpoints={{ schedules: `/api/operator/channels/${channel.id}/schedules`, creators: "/api/operator/channels", channelId: channel.id }} />
  </>}</OperatorFrame>;
}
