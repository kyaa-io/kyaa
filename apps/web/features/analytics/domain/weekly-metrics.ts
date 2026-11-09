import { z } from "zod";

/** Month-end member target from the 2026-11 reporting request; the only number here that is not counted from a table. */
export const MEMBER_GOAL = 3000;

const count = z.number().int().nonnegative();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const weeklyMetricsSchema = z.object({
  timezone: z.literal("Asia/Seoul"),
  from: z.iso.datetime({ offset: true }),
  to: z.iso.datetime({ offset: true }),
  weeks: z.array(z.object({
    weekStart: day,
    weekEnd: day,
    inProgress: z.boolean(),
    signups: count,
    activeMembers: count,
    posts: count,
    comments: count,
    pointsGranted: count,
    heartsGranted: count,
    cumulativeSignups: count,
  }).strict()).length(8),
}).strict();
export type WeeklyMetricsData = z.infer<typeof weeklyMetricsSchema>;
export type WeeklyMetricsWeek = WeeklyMetricsData["weeks"][number];

/** Cumulative sign-ups as a share of the target, one decimal (e.g. 2939 -> 98). */
export function goalPercent(cumulativeSignups: number): number {
  return Math.round((cumulativeSignups / MEMBER_GOAL) * 1000) / 10;
}

export const WEEKLY_COLUMNS = [
  ["week", "주 (월~일)", "Week (Mon-Sun)"],
  ["signups", "가입", "Sign-ups"],
  ["activeMembers", "주간 활성", "Weekly active"],
  ["posts", "글", "Posts"],
  ["comments", "댓글", "Comments"],
  ["pointsGranted", "포인트 지급", "Points granted"],
  ["heartsGranted", "하트 지급", "Hearts granted"],
  ["cumulativeSignups", "누적 가입", "Total sign-ups"],
] as const;
export type WeeklyColumn = (typeof WEEKLY_COLUMNS)[number][0];

/** The table's columns as CSV (UTF-8 with a byte-order mark so spreadsheets read Korean). The cumulative column is followed by its share of the target. */
export function weeklyMetricsCsv(data: WeeklyMetricsData, locale: "ko" | "en"): string {
  const index = locale === "ko" ? 1 : 2;
  const header = [...WEEKLY_COLUMNS.map((column) => column[index]), locale === "ko" ? `목표 ${MEMBER_GOAL}명 대비 %` : `% of ${MEMBER_GOAL} goal`];
  const rows = data.weeks.map((week) => [
    `${week.weekStart}~${week.weekEnd}`, week.signups, week.activeMembers, week.posts, week.comments,
    week.pointsGranted, week.heartsGranted, week.cumulativeSignups, goalPercent(week.cumulativeSignups),
  ]);
  return `﻿${[header, ...rows].map((row) => row.join(",")).join("\r\n")}\r\n`;
}
