import { describe, expect, it } from "vitest";
import { branches, stems, type Chart } from "./chart";
import { monthReading, yearReading } from "./copy";
import { depthDomains, sajuBasis, sajuDomains } from "./depth";

const at = (iso: string) => Date.parse(`${iso}T03:00:00Z`);
const chartOf = (index: number): Chart => ({
  pillars: {
    year: { heavenlyStem: "무", earthlyBranch: "인" },
    month: { heavenlyStem: "을", earthlyBranch: "묘" },
    day: { heavenlyStem: stems[index % 10], earthlyBranch: branches[index % 12] },
    hour: { heavenlyStem: "기", earthlyBranch: "미" },
  },
  timeKnown: true,
  termBoundary: false,
  locked: [],
  lockReason: null,
  solarTerm: null,
});
const charts = Array.from({ length: 60 }, (_, index) => chartOf(index));
/** 달의 첫 주·가운데·마지막 주·절기 바로 앞과, 해의 처음·끝. */
const days = ["2026-11-08", "2026-11-15", "2026-11-22", "2026-11-30", "2026-12-06", "2026-02-05", "2027-01-30", "2026-06-17"];

describe("이달: 지난 주는 권하지 않는다", () => {
  it("힘 있는 주·쉬어 갈 주 표시는 아직 끝나지 않은 주에만 단다(일주 60가지 × 날짜 8개)", () => {
    for (const chart of charts)
      for (const day of days) {
        const month = monthReading(chart, at(day));
        const marked = month.weeks.filter((week) => week.mark);
        expect(marked.every((week) => !week.past)).toBe(true);
        expect(month.weeks.filter((week) => week.mark === "good")).toHaveLength(1);
        // 최애 한마디에 나오는 주는 지난 흐름으로 말한 주 하나와 남은 주뿐이다.
        for (const week of month.weeks.filter((item) => item.past)) {
          if (week.range === month.past) expect(month.line.ban).toContain(`${week.range} 주는 지났어`);
          else expect(month.line.ban).not.toContain(week.range);
        }
      }
  });
  it("11/22 에 본 이달 풀이는 11.7~11.13 주를 힘 있는 주로 권하지 않는다", () => {
    for (const chart of charts) {
      const month = monthReading(chart, at("2026-11-22"));
      expect(month.strong).not.toMatch(/^11\.7~|^11\.14~/);
      expect(month.line.ban).not.toMatch(/11\.7~11\.13 주가 제일 힘 있어/);
    }
  });
  it("더 좋았던 주가 지났으면 지난 흐름으로 따로 적고, 남은 주에서 하나를 권한다", () => {
    const found = charts
      .map((chart) => monthReading(chart, at("2026-11-30")))
      .find((month) => month.past);
    expect(found).toBeTruthy();
    expect(found!.line.yo).toContain("지났어요. 남은 날 중엔");
    expect(found!.line.hao).toContain("지났소. 남은 날 중에는");
    expect(found!.basis.map((row) => row.kind)).toContain("past");
  });
  it("달과 나 한 줄은 달 단위 말이다(주 단위 말 없음)", () => {
    for (const chart of charts) expect(monthReading(chart, at("2026-11-22")).bond).not.toContain("이번 주");
  });
});

describe("올해: 지난 달은 권하지 않는다", () => {
  it("좋은 달·여유 둘 달 표시는 아직 끝나지 않은 달에만 단다", () => {
    for (const chart of charts)
      for (const day of days) {
        const year = yearReading(chart, at(day));
        expect(year.months.filter((month) => month.mark).every((month) => !month.past)).toBe(true);
        expect(year.months.filter((month) => month.mark === "good").length).toBeGreaterThan(0);
        if (year.past) expect(year.line.ban).toContain("지났어");
      }
  });
});

describe("풀이 근거와 영역별 풀이", () => {
  it("근거 줄은 계산 값과 쉬운 풀이를 함께 가진다", () => {
    const chart = chartOf(42); // 병오
    const first = sajuBasis(chart, at("2026-11-22"), "first");
    expect(first.map((row) => row.term)).toEqual(["일간", "일지", "오행", "신강", "도움 기운", "세운"]);
    expect(first[0].value).toBe("병화");
    expect(first[2].value).toBe("나무 3 · 불 2 · 흙 3 · 쇠 0 · 물 0");
    expect(first[5].value).toBe("병오년 · 비견");
    const month = sajuBasis(chart, at("2026-11-22"), "month");
    expect(month[0].value).toBe("기해월 · 상관");
    for (const view of ["first", "year", "month"] as const)
      for (const row of sajuBasis(chart, at("2026-11-22"), view)) {
        expect(row.value.length).toBeGreaterThan(0);
        expect(row.plain.length).toBeGreaterThan(8);
      }
  });
  it("영역 다섯 개가 2~4문장씩이고, 같은 입력이면 같은 문장이다", () => {
    for (const chart of charts)
      for (const view of ["first", "year", "month"] as const) {
        const domains = sajuDomains(chart, at("2026-11-22"), view);
        expect(domains.map((item) => item.key)).toEqual([...depthDomains]);
        for (const item of domains) {
          const count = item.sentences.join(" ").split(/(?<=[.!?])\s+/).length;
          expect(count).toBeGreaterThanOrEqual(2);
          expect(count).toBeLessThanOrEqual(4);
          // 풀이에 없는 날짜·금액은 만들지 않는다.
          expect(item.sentences.join(" ")).not.toMatch(/[0-9]+월|[0-9]+일(?!진)|[0-9,]+원/);
        }
        expect(sajuDomains(chart, at("2026-11-22"), view)).toEqual(domains);
      }
  });
  it("시간을 몰라 잠긴 사주표는 오행 개수 줄을 빼고 일지만 읽는다", () => {
    const locked: Chart = { ...chartOf(42), pillars: { ...chartOf(42).pillars, month: null, hour: null }, locked: ["fiveElements"] };
    expect(sajuBasis(locked, at("2026-11-22"), "first").map((row) => row.term)).toEqual(["일간", "일지", "세운"]);
    const money = sajuDomains(locked, at("2026-11-22"), "month").find((item) => item.key === "money")!;
    expect(money.basis).toBe("월운 상관");
    expect(money.sentences).toHaveLength(2);
  });
});
