import { describe, expect, it } from "vitest";
import { goalPercent, weeklyMetricsCsv, weeklyMetricsSchema } from "./weekly-metrics";

const monday = (n: number, plusDays = 0) => new Date(Date.UTC(2026, 8, 7 + n * 7 + plusDays)).toISOString().slice(0, 10);
const week = (n: number) => ({
  weekStart: monday(n), weekEnd: monday(n, 6), inProgress: n === 7,
  signups: n, activeMembers: n * 2, posts: 3, comments: 4, pointsGranted: 1200, heartsGranted: 5, cumulativeSignups: 2000 + n * 100,
});
const data = weeklyMetricsSchema.parse({
  timezone: "Asia/Seoul", from: "2026-09-06T15:00:00Z", to: "2026-11-08T15:00:00Z",
  weeks: Array.from({ length: 8 }, (_, n) => week(n)),
});

describe("weekly metrics", () => {
  it("shows the share of the 3,000 goal with one decimal", () => {
    expect(goalPercent(2939)).toBe(98);
    expect(goalPercent(1)).toBe(0);
    expect(goalPercent(2700)).toBe(90);
    expect(goalPercent(3100)).toBe(103.3);
  });
  it("accepts exactly eight weeks and no extra or negative field", () => {
    expect(weeklyMetricsSchema.safeParse({ ...data, weeks: data.weeks.slice(1) }).success).toBe(false);
    expect(weeklyMetricsSchema.safeParse({ ...data, weeks: data.weeks.map((w) => ({ ...w, memberId: "x" })) }).success).toBe(false);
    expect(weeklyMetricsSchema.safeParse({ ...data, weeks: data.weeks.map((w) => ({ ...w, posts: -1 })) }).success).toBe(false);
  });
  it("writes the table's columns, one row per week, with a byte-order mark and the share of the goal", () => {
    const lines = weeklyMetricsCsv(data, "ko").split("\r\n");
    expect(lines[0]).toBe("﻿주 (월~일),가입,주간 활성,글,댓글,포인트 지급,하트 지급,누적 가입,목표 3000명 대비 %");
    expect(lines).toHaveLength(10);
    expect(lines[8]).toBe(`${monday(7)}~${monday(7, 6)},7,14,3,4,1200,5,2700,90`);
    expect(lines[9]).toBe("");
    expect(lines.slice(0, 9).every((line) => line.split(",").length === 9)).toBe(true);
  });
  it("labels the English file in English", () => {
    expect(weeklyMetricsCsv(data, "en").split("\r\n")[0]).toBe("﻿Week (Mon-Sun),Sign-ups,Weekly active,Posts,Comments,Points granted,Hearts granted,Total sign-ups,% of 3000 goal");
  });
});
