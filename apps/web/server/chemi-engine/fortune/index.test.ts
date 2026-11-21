import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { fortuneGrade } from "./index";

describe("v55 fortune grade contract", () => {
  it("covers all 49 scores with the five specified intervals", () => {
    const counts = new Map<string, number>();
    for (let score = 50; score <= 98; score++) {
      const grade = fortuneGrade(score);
      expect(score).toBeGreaterThanOrEqual(grade.min);
      expect(score).toBeLessThanOrEqual(grade.max);
      expect(fortuneGrade(score)).toEqual(grade);
      counts.set(grade.name, (counts.get(grade.name) ?? 0) + 1);
    }
    expect(Object.fromEntries(counts)).toEqual({
      "쉬어 가는 날": 10, "조심하면 괜찮은 날": 10,
      "무난한 날": 10, "좋은 날": 10, "아주 좋은 날": 9,
    });
  });
  it.each([49, 99, 70.5, NaN, Infinity, -Infinity])("rejects invalid score %s", (score) => {
    expect(() => fortuneGrade(score)).toThrow(RangeError);
  });
});

import { computeDailyFortune, FORTUNE_GRADES } from "./index";

it("checks 60 consecutive Korean dates for each of ten fixed natal charts", () => {
  const counts = [0,0,0,0,0];
  for (const [i, heavenlyStem] of [..."갑을병정무기경신임계"].entries()) {
    const pillars = { year: {heavenlyStem:"갑",earthlyBranch:"자"}, month:{heavenlyStem:"병",earthlyBranch:"인"},
      day:{heavenlyStem,earthlyBranch:"자축인묘진사오미신유"[i]}, hour:null };
    for (let d=0; d<60; d++) {
      const date = new Date(Date.UTC(2026,0,1+d)).toISOString().slice(0,10);
      const result = computeDailyFortune({pillars},date);
      expect(computeDailyFortune({pillars},date)).toEqual(result);
      if (result.locked) throw new Error("six-character chart unexpectedly locked");
      expect(result.evidence.timeBasis).toBe("시간 모름으로 계산");
      expect(Object.keys(result.fields)).toHaveLength(6);
      if (result.score >= 62 && result.score <= 86) {
        expect(new Set(Object.values(result.fields)).size).toBeGreaterThanOrEqual(3);
      }
      expect(Object.keys(result.periods)).toHaveLength(3);
      for (const value of [result.score,...Object.values(result.fields),...Object.values(result.periods)]) {
        expect(value).toBeGreaterThanOrEqual(50);
        expect(value).toBeLessThanOrEqual(98);
      }
      counts[FORTUNE_GRADES.indexOf(result.grade)]++;
    }
  }
  process.stdout.write(JSON.stringify(counts) + "\n");
  const ranges = [[1,20],[10,40],[20,50],[10,40],[1,20]];
  counts.forEach((count,i) => expect(count/6 >= ranges[i][0] && count/6 <= ranges[i][1]).toBe(true));
});

it("uses the selected date across the corrected Seoul 자시 boundary", () => {
  const day = {heavenlyStem:"을",earthlyBranch:"묘"};
  const chart = {pillars:{day, month:day, year:day, hour:day}};
  const result = computeDailyFortune(chart,"2000-01-07");
  expect(computeDailyFortune(chart,new Date("2000-01-07T23:29:59+09:00"))).toEqual(result);
  expect(computeDailyFortune(chart,new Date("2000-01-07T23:30:00+09:00"))).toEqual(computeDailyFortune(chart,"2000-01-08"));
  expect(result).toMatchObject({locked:false, evidence:{dayPillar:"갑자"}, luck:{luckyHour:{start:19,end:21},restHour:{start:17,end:19}}});
  expect(computeDailyFortune({pillars:{...chart.pillars, month:null}}, "2000-01-07").locked).toBe(true);
  expect(() => computeDailyFortune(chart,"2026-02-30")).toThrow(RangeError);
});
