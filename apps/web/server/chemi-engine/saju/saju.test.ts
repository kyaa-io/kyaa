import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createRequire } from "node:module";
import { calculateFourPillars, equationOfTimeMinutes, getSolarTermsOfYear } from "manseryeok";
import { calculateSaju, SAJU_OPTIONS } from "./index";
import { HIDDEN_STEMS, lifeStage, spirit } from "./tables";
const { Solar } = createRequire(import.meta.url)("lunar-javascript");

describe("사주 고정 관법", () => {
  it("현대 기준 생일 40건의 네 기둥을 독립 엔진과 대조한다", () => {
    for (let i = 0; i < 40; i++) {
      const input = { year: 1990 + i % 30, month: 1 + i % 12, day: 10 + i % 15, hour: 12, minute: 0 };
      const r = calculateSaju(input);
      const lunar = Solar.fromYmdHms(input.year, input.month, input.day, 11, 30, 0).getLunar();
      expect([r.pillars.year, r.pillars.month, r.pillars.day, r.pillars.hour].map(p => p && p.heavenlyStem + p.earthlyBranch)).toEqual([
        lunar.getYearInGanZhiExact(), lunar.getMonthInGanZhiExact(), lunar.getDayInGanZhiExact(), lunar.getTimeInGanZhi(),
      ].map((v: string) => [...v].map(c => ({甲:'갑',乙:'을',丙:'병',丁:'정',戊:'무',己:'기',庚:'경',辛:'신',壬:'임',癸:'계',子:'자',丑:'축',寅:'인',卯:'묘',辰:'진',巳:'사',午:'오',未:'미',申:'신',酉:'유',戌:'술',亥:'해'}[c])).join('')));
    }
  });
  it("보정 후 23시부터 다음 일주가 된다", () => {
    const a = calculateSaju({year:2024,month:3,day:10,hour:23,minute:0});
    const b = calculateSaju({year:2024,month:3,day:10,hour:23,minute:59});
    expect(a.pillars.day).not.toEqual(b.pillars.day);
    expect(b.pillars.hour?.earthlyBranch).toBe("자");
  });
  it("서울 약 30분과 균시차를 적용한다", () => {
    expect((126.978 - 135) * 4).toBeCloseTo(-32.088);
    const input = {year:1990,month:5,day:15,hour:7,minute:5};
    expect(calculateSaju(input).pillars.hour).toEqual(calculateFourPillars({...input,...SAJU_OPTIONS}).hour);
    expect(calculateSaju(input).pillars.hour?.earthlyBranch).toBe("묘");
    expect(Number.isFinite(equationOfTimeMinutes(2451545))).toBe(true);
  });
  it("입춘 당일 시간 모름은 연월과 해당 주제를 잠그되 돈은 열어 둔다", () => {
    const term = getSolarTermsOfYear(2024).find(t => t.index === 2)!;
    const date = new Date(term.date.getTime()+9*3600000);
    const r = calculateSaju({year:2024,month:date.getUTCMonth()+1,day:date.getUTCDate()});
    expect(r.termBoundary).toBe(true);
    expect(r.pillars.year).toBeNull(); expect(r.pillars.month).toBeNull(); expect(r.pillars.hour).toBeNull();
    expect(r.lockReason).toBe("시간을 알면 열려요"); expect(r.locked).not.toContain("money");
  });
  it("일반 시간 모름과 잘못된 날짜", () => {
    expect(calculateSaju({year:2000,month:5,day:15}).pillars.hour).toBeNull();
    expect(calculateSaju({year:2000,month:5,day:15}).termBoundary).toBe(false);
    expect(() => calculateSaju({year:2000,month:2,day:30})).toThrow();
  });
  it("고정표 대표값", () => {
    expect(HIDDEN_STEMS.인).toEqual(["갑","병","무"]);
    expect(lifeStage("갑","해")).toBe("장생"); expect(lifeStage("을","오")).toBe("장생");
    expect(spirit("자","인")).toBe("역마살");
  });
});
