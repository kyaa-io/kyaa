import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { calculateFourPillars, getVoidBranches } from "manseryeok";
import {
  balanceElements,
  branchRelation,
  branches,
  chartRelations,
  dayPillarAt,
  elementRatio,
  groupOf,
  helpingElement,
  luckTable,
  sexagenaryIndex,
  stems,
  strengthBands,
  strengthOf,
  tenGod,
  tenGodDistribution,
  voidOf,
  yearTable,
  type Chart,
  type Pillar,
} from "@/app/chemi/saju/chart";
import { computeDailyFortune } from "../fortune/index";
import { calculateSaju, SAJU_OPTIONS } from "./index";
import external from "./external-manseryeok-kr.json";
import { buildSamples, independentLuckForward, independentPillars, KOREA_CHINA_LEAP_DIFF, type Sample } from "./samples";

const name = (p: Pillar | null) => (p ? p.heavenlyStem + p.earthlyBranch : "-");
const chartOf = (s: Sample) => ({ ...calculateSaju(s), gender: s.gender }) as unknown as Chart & { gender: Sample["gender"] };
const ours = (s: Sample) => {
  const c = calculateSaju(s);
  return [c.pillars.year, c.pillars.month, c.pillars.day, c.pillars.hour].map(name);
};
/** 독립 엔진과 다르면 여기에 사유와 함께 적는다. 지금은 없다. */
const EXCEPTIONS: Record<number, string> = {};
const samples = buildSamples();

describe("표본 200건 대조(1930~2020)", () => {
  it("범주별 개수", () => {
    const count = (kind: Sample["kind"]) => samples.filter((s) => s.kind === kind).length;
    expect(samples).toHaveLength(200);
    expect([count("절입"), count("밤11시"), count("서머타임"), count("옛표준시"), count("윤달"), count("시경계"), count("무작위")]).toEqual([40, 20, 30, 20, 20, 40, 30]);
  });

  it("네 기둥이 독립 엔진(lunar-javascript, tzdb, 경도 보정)과 같다", () => {
    const differ = samples.filter((s) => ours(s).join(" ") !== independentPillars(s, false).pillars.join(" "));
    expect(differ.filter((s) => !EXCEPTIONS[s.id]).map((s) => s.id)).toEqual([]);
  });

  it("대운 방향이 독립 엔진과 같다", () => {
    const differ = samples.filter((s) => chartOf(s).luckPillars?.forward !== independentLuckForward(s));
    expect(differ.map((s) => s.id)).toEqual([]);
  });

  it("균시차를 켜면 시주가 15건, 일주가 3건 바뀐다(끈 근거)", () => {
    const withEot = (s: Sample) => {
      const c = calculateFourPillars({ ...s, ...SAJU_OPTIONS, trueSolarTime: { ...SAJU_OPTIONS.trueSolarTime, applyEquationOfTime: true } });
      return [c.year, c.month, c.day, c.hour].map(name);
    };
    const changed = samples.map((s) => [ours(s), withEot(s)]);
    expect(changed.filter(([a, b]) => a[3] !== b[3])).toHaveLength(15);
    expect(changed.filter(([a, b]) => a[2] !== b[2])).toHaveLength(3);
  });

  it("한국과 중국 음력 윤달이 다른 해는 한국(KASI) 기준이다", () => {
    expect(KOREA_CHINA_LEAP_DIFF).toEqual([2012, 2017]);
    expect(() => calculateSaju({ year: 2012, month: 3, day: 10, isLunar: true, isLeapMonth: true })).not.toThrow();
    expect(() => calculateSaju({ year: 2012, month: 4, day: 10, isLunar: true, isLeapMonth: true })).toThrow();
    expect(() => calculateSaju({ year: 2017, month: 5, day: 10, isLunar: true, isLeapMonth: true })).not.toThrow();
  });
});

describe("외부 대조: manseryeok.kr 50건", () => {
  it.each(external.rows)("표본 $sample($kind) $query", (row) => {
    const s = samples.find((x) => x.id === row.sample)!;
    expect(ours(s).join(" ")).toBe(row.pillars);
    const luck = chartOf(s).luckPillars!;
    expect(`${luck.forward ? "순행" : "역행"} ${luck.startAge}`).toBe(row.luck);
  });
});

describe("성질 시험", () => {
  it("하루가 지나면 일주가 60갑자 한 칸 전진한다(1930~2030, 해마다 앞 40일)", () => {
    for (let year = 1930; year <= 2030; year++) {
      let prev: number | null = null;
      for (let day = 0; day < 40; day++) {
        const at = Date.UTC(year, 0, 1 + day, 3);
        const index = sexagenaryIndex(dayPillarAt(at));
        if (prev != null) expect(index).toBe((prev + 1) % 60);
        prev = index;
      }
    }
  });

  it("십신 10×10: 관계가 양쪽에서 맞물린다", () => {
    const mirror = { 비겁: "비겁", 식상: "인성", 인성: "식상", 재성: "관성", 관성: "재성" } as const;
    for (const a of stems)
      for (const b of stems) {
        const ab = tenGod(a, b);
        const ba = tenGod(b, a);
        expect(groupOf(ba)).toBe(mirror[groupOf(ab)]);
        // 음양이 같으면 편(비견·식신·편재·편관·편인), 다르면 정
        expect(["비견", "식신", "편재", "편관", "편인"].includes(ab)).toBe(stems.indexOf(a) % 2 === stems.indexOf(b) % 2);
      }
  });

  it("합·충 표는 양방향이다", () => {
    for (const a of branches) for (const b of branches) expect(branchRelation(a, b)).toBe(branchRelation(b, a));
    const chart = (y: string, m: string, d: string) =>
      ({ pillars: { year: { heavenlyStem: y[0], earthlyBranch: y[1] }, month: { heavenlyStem: m[0], earthlyBranch: m[1] }, day: { heavenlyStem: d[0], earthlyBranch: d[1] }, hour: null } }) as unknown as Chart;
    const kinds = (c: Chart) => chartRelations(c).map((r) => r.kind + r.letters.split("").sort().join("")).sort();
    expect(kinds(chart("갑자", "기오", "병묘"))).toEqual(kinds(chart("병묘", "기오", "갑자")));
  });

  it("공망은 manseryeok 와 같다(60일주)", () => {
    for (let i = 0; i < 60; i++) {
      const day = { heavenlyStem: stems[i % 10], earthlyBranch: branches[i % 12] };
      const c = { pillars: { year: null, month: null, day, hour: null } } as unknown as Chart;
      expect(voidOf(c).branches).toEqual(getVoidBranches(day.heavenlyStem, day.earthlyBranch));
    }
  });
});

describe("신강 지수 분포(1950~2025, 사흘 간격 9,253명)", () => {
  it("신강·중화·신약이 각각 15% 이상이고 균형점 50 이 가운데에 온다", () => {
    const tally = { 신강: 0, 중화: 0, 신약: 0 };
    const index: number[] = [];
    for (let at = Date.UTC(1950, 0, 1); at < Date.UTC(2026, 0, 1); at += 3 * 86400000) {
      const d = new Date(at);
      // calculateSaju 와 같은 보정(SAJU_OPTIONS)으로 네 기둥만 빠르게 계산한다.
      const c = calculateFourPillars({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: (d.getUTCDate() * 7) % 24, minute: (d.getUTCDate() * 13) % 60, ...SAJU_OPTIONS });
      const s = strengthOf({ pillars: { year: c.year, month: c.month, day: c.day, hour: c.hour } } as unknown as Chart)!;
      tally[s.class]++;
      index.push(s.index);
    }
    const n = index.length;
    expect(n).toBe(9253);
    for (const share of Object.values(tally)) expect(share / n).toBeGreaterThanOrEqual(0.15);
    index.sort((a, b) => a - b);
    expect(index[Math.floor(n / 2)]).toBe(50);
    expect(strengthBands).toEqual({ weakBelow: 42, strongFrom: 58 });
  });
});

describe("새 계산", () => {
  // 1990-05-15 09:30 남: 경오 · 신사 · 경진 · 경진시(manseryeok.kr 와 같음)
  const sample = { ...calculateSaju({ year: 1990, month: 5, day: 15, hour: 9, minute: 30, gender: "male" }) } as unknown as Chart;

  it("오행 비율은 지장간 비중을 넣어 합이 100 이다", () => {
    const ratio = elementRatio(sample);
    expect(Object.values(ratio).reduce((a, b) => a + b, 0)).toBe(100);
    // 천간 경·신·경·경(쇠 4) + 지지 오(병10 기9 정11)·사(무7 경7 병16)·진(을9 계3 무18)×2
    expect(ratio).toEqual({ wood: 8, fire: 15, earth: 22, metal: 53, water: 2 });
  });

  it("신강 지수: 월령·뿌리·세력", () => {
    const s = strengthOf(sample)!;
    // 돕는 몫 6.2 / 9.5 = 65% × 1.25 → 82. manseryeok.kr 도 신강으로 본다.
    expect(s).toEqual({ index: 82, class: "신강", leansStrong: true, seasonHelps: false, helpers: 5, drainers: 2 });
  });

  it("월주를 모르면(입춘 당일 + 시간 모름) 신강 지수를 내지 않고 가장 적은 기운으로 돌아간다", () => {
    const locked = calculateSaju({ year: 2024, month: 2, day: 4 }) as unknown as Chart;
    expect(locked.pillars.month).toBeNull();
    expect(strengthOf(locked)).toBeNull();
    expect(balanceElements(locked)).toBeNull();
    expect(typeof helpingElement(locked)).toBe("string");
  });

  it("십신 분포는 일간을 뺀 7글자", () => {
    const dist = tenGodDistribution(sample);
    expect(dist.reduce((sum, g) => sum + g.count, 0)).toBe(7);
    // manseryeok.kr 십성 줄과 같다: 비견 2 · 겁재 1, 편관 1 · 정관 1, 편인 2
    expect(Object.fromEntries(dist.map((g) => [g.group, g.count]))).toEqual({ 비겁: 3, 식상: 0, 재성: 0, 관성: 2, 인성: 2 });
  });

  it("합·충·형을 기둥과 함께 돌려준다", () => {
    expect(chartRelations(sample)).toEqual([{ kind: "자형", letters: "진진", keys: ["hour", "day"] }]);
    const busy = { pillars: { year: { heavenlyStem: "갑", earthlyBranch: "신" }, month: { heavenlyStem: "기", earthlyBranch: "자" }, day: { heavenlyStem: "정", earthlyBranch: "진" }, hour: { heavenlyStem: "임", earthlyBranch: "오" } } } as unknown as Chart;
    expect(chartRelations(busy)).toEqual([
      // 글자는 명식표 순서(시·일·월·년)로 적는다.
      { kind: "천간합", letters: "기갑", keys: ["month", "year"], element: "earth" },
      { kind: "천간합", letters: "임정", keys: ["hour", "day"], element: "wood" },
      { kind: "삼합", letters: "신자진", keys: ["year", "month", "day"], element: "water" },
      { kind: "충", letters: "오자", keys: ["hour", "month"] },
    ]);
  });

  it("대운 표와 세운 표", () => {
    const rows = luckTable(sample, 36)!;
    expect(rows[0]).toMatchObject({ age: 7, pillar: { heavenlyStem: "임", earthlyBranch: "오" }, stemGod: "식신" });
    expect(rows.filter((r) => r.current).map((r) => r.age)).toEqual([27]);
    const years = yearTable(sample, 2026, 10);
    expect(years.map((y) => y.pillar.heavenlyStem + y.pillar.earthlyBranch).slice(0, 2)).toEqual(["병오", "정미"]);
    expect(years[0].stemGod).toBe("편관");
  });

  it("도움 기운은 사주 화면과 오늘의 운세가 같은 값이다(표본 200건)", () => {
    const term = { wood: "목", fire: "화", earth: "토", metal: "금", water: "수" } as const;
    for (const s of samples) {
      const chart = chartOf(s);
      const fortune = computeDailyFortune(chart as never, "2026-11-23");
      if (fortune.locked) continue;
      expect(fortune.evidence.useful).toBe(term[helpingElement(chart)]);
      expect(fortune.evidence.useful).toBe(term[balanceElements(chart)!.useful]);
    }
  });
});
