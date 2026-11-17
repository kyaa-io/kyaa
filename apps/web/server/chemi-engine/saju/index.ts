import "server-only";
import { calculateFourPillars, getSolarTermsOfYear, lunarToSolar, type BirthInfo } from "manseryeok";
import { HIDDEN_STEMS, TABLE_VERSION, lifeStage, spirit, BRANCH_COMBINATIONS, BRANCH_CLASHES } from "./tables";

export const ENGINE_VERSION = "manseryeok@2.0.0";
export const SAJU_OPTIONS = { dayBoundary: "jasi", trueSolarTime: { longitude: 126.978, applyEquationOfTime: true, applyHistoricalDst: true } } as const;
export type SajuInput = Omit<BirthInfo, "hour" | "minute" | "dayBoundary" | "trueSolarTime"> & { hour?: number | null; minute?: number | null };

export function calculateSaju(input: SajuInput) {
  const unknown = input.hour == null;
  if (unknown && input.minute != null) throw new RangeError("시간 없이 분을 지정할 수 없습니다");
  const solar = input.isLunar ? lunarToSolar(input.year, input.month, input.day, input.isLeapMonth ?? false) : input;
  // 정오는 날짜 검증과 시간과 무관한 기둥 계산에만 사용한다. 시주는 반환하지 않는다.
  const chart = calculateFourPillars({ ...input, hour: input.hour ?? 12, minute: input.minute ?? 0, ...SAJU_OPTIONS });
  const dateKey = `${solar.year}-${String(solar.month).padStart(2, "0")}-${String(solar.day).padStart(2, "0")}`;
  const term = getSolarTermsOfYear(solar.year).filter(t => t.index % 2 === 0).find(t => {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(t.date);
    return parts === dateKey;
  });
  const uncertainMonth = unknown && term != null;
  const pillars = { year: uncertainMonth && term?.index === 2 ? null : chart.year, month: uncertainMonth ? null : chart.month, day: chart.day, hour: unknown ? null : chart.hour };
  const details = Object.fromEntries(Object.entries(pillars).map(([key, pillar]) => [key, pillar == null ? null : {
    hiddenStems: HIDDEN_STEMS[pillar.earthlyBranch],
    lifeStage: lifeStage(chart.day.heavenlyStem, pillar.earthlyBranch),
    spirit: pillars.year ? spirit(pillars.year.earthlyBranch, pillar.earthlyBranch) : null,
    tenGods: chart.tenGods[key as keyof typeof chart.tenGods],
  }]));
  const branches = Object.values(pillars).flatMap(p => p ? [p.earthlyBranch] : []);
  const relations = {
    combinations: BRANCH_COMBINATIONS.filter(pair => pair.every(b => branches.includes(b))),
    clashes: BRANCH_CLASHES.filter(pair => pair.every(b => branches.includes(b))),
  };
  return {
    relations,
    engineVersion: ENGINE_VERSION, tableVersion: TABLE_VERSION, pillars, details,
    luckPillars: unknown ? null : chart.luckPillars ?? null,
    timeKnown: !unknown, termBoundary: uncertainMonth,
    locked: uncertainMonth ? ["personality", "fiveElements", "majorLuck", "career"] : [],
    lockReason: uncertainMonth ? "시간을 알면 열려요" : null,
    solarTerm: term ? { name: term.name, at: term.date.toISOString() } : null,
  };
}
