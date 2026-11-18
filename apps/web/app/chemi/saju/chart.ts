/**
 * 저장된 사주표(서버 calculateSaju 결과)에서 화면이 쓰는 값을 뽑는 순수 계산.
 * 서버 전용 표를 가져오지 않도록 천간·지지·오행·십신 표를 여기서 따로 둔다(값은 manseryeok 와 같다).
 */
import { getSolarTermsOfYear } from "manseryeok";

export const stems = ["갑", "을", "병", "정", "무", "기", "경", "신", "임", "계"] as const;
export const branches = ["자", "축", "인", "묘", "진", "사", "오", "미", "신", "유", "술", "해"] as const;
export type Stem = (typeof stems)[number];
export type Branch = (typeof branches)[number];
export type Element = "wood" | "fire" | "earth" | "metal" | "water";

export const elements: readonly Element[] = ["wood", "fire", "earth", "metal", "water"];
export const elementName: Record<Element, string> = {
  wood: "나무",
  fire: "불",
  earth: "흙",
  metal: "쇠",
  water: "물",
};
/** 부족한 기운을 채우는 색. 도움 기운 줄에 함께 적는다. */
export const elementColor: Record<Element, string> = {
  wood: "초록",
  fire: "빨강",
  earth: "노랑",
  metal: "흰색",
  water: "남색",
};
export const stemElement: Record<Stem, Element> = {
  갑: "wood", 을: "wood", 병: "fire", 정: "fire", 무: "earth",
  기: "earth", 경: "metal", 신: "metal", 임: "water", 계: "water",
};
const branchElement: Record<Branch, Element> = {
  자: "water", 축: "earth", 인: "wood", 묘: "wood", 진: "earth", 사: "fire",
  오: "fire", 미: "earth", 신: "metal", 유: "metal", 술: "earth", 해: "water",
};
export const generates: Record<Element, Element> = {
  wood: "fire", fire: "earth", earth: "metal", metal: "water", water: "wood",
};
const controls: Record<Element, Element> = {
  wood: "earth", fire: "metal", earth: "water", metal: "wood", water: "fire",
};

export type Pillar = { heavenlyStem: Stem; earthlyBranch: Branch };
export type Chart = {
  pillars: Record<"year" | "month" | "day" | "hour", Pillar | null>;
  luckPillars?: {
    forward: boolean;
    startAge: number;
    pillars: { age: number; pillar: Pillar; korean: string }[];
  } | null;
  timeKnown: boolean;
  termBoundary: boolean;
  locked: string[];
  lockReason: string | null;
  solarTerm: { name: string; at: string } | null;
};

export function isChart(value: unknown): value is Chart {
  const chart = value as Chart | null;
  const day = chart?.pillars?.day;
  return (
    !!day &&
    stems.includes(day.heavenlyStem) &&
    branches.includes(day.earthlyBranch) &&
    Array.isArray(chart?.locked) &&
    typeof chart?.timeKnown === "boolean"
  );
}

export const dayStem = (chart: Chart) => chart.pillars.day!.heavenlyStem;
export const dayBranch = (chart: Chart) => chart.pillars.day!.earthlyBranch;

/** 네 기둥의 천간·지지 8글자(시간을 모르면 6글자) 중 오행별 개수. */
export function elementCounts(chart: Chart): Record<Element, number> {
  const counts: Record<Element, number> = { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 };
  for (const pillar of Object.values(chart.pillars)) {
    if (!pillar) continue;
    counts[stemElement[pillar.heavenlyStem]] += 1;
    counts[branchElement[pillar.earthlyBranch]] += 1;
  }
  return counts;
}

/** 가장 적은 오행. 같으면 일간을 살리는(낳아 주는) 쪽을 먼저 본다. */
export function helpingElement(chart: Chart): Element {
  const counts = elementCounts(chart);
  const own = stemElement[dayStem(chart)];
  const mother = elements.find((element) => generates[element] === own)!;
  const least = Math.min(...elements.map((element) => counts[element]));
  const pool = elements.filter((element) => counts[element] === least);
  return pool.includes(mother) ? mother : pool[0];
}

export const tenGods = [
  "비견", "겁재", "식신", "상관", "편재", "정재", "편관", "정관", "편인", "정인",
] as const;
export type TenGod = (typeof tenGods)[number];

const polarity = (stem: Stem) => stems.indexOf(stem) % 2;

/** 일간 기준으로 본 다른 천간의 십신. */
export function tenGod(day: Stem, other: Stem): TenGod {
  const a = stemElement[day];
  const b = stemElement[other];
  const same = polarity(day) === polarity(other);
  if (a === b) return same ? "비견" : "겁재";
  if (generates[a] === b) return same ? "식신" : "상관";
  if (controls[a] === b) return same ? "편재" : "정재";
  if (controls[b] === a) return same ? "편관" : "정관";
  return same ? "편인" : "정인";
}

/** 지지 육합 짝. */
const pairs: Record<Branch, Branch> = {
  자: "축", 축: "자", 인: "해", 해: "인", 묘: "술", 술: "묘",
  진: "유", 유: "진", 사: "신", 신: "사", 오: "미", 미: "오",
};
const clash = (a: Branch) => branches[(branches.indexOf(a) + 6) % 12];
/** 삼합 무리: 같은 무리면 서로 돕는다. */
const trio = (a: Branch) => branches.indexOf(a) % 4;

export type Relation = "good" | "plain" | "rough";
export function branchRelation(mine: Branch, other: Branch): Relation {
  if (clash(mine) === other) return "rough";
  if (pairs[mine] === other || (trio(mine) === trio(other) && mine !== other)) return "good";
  return "plain";
}

/** 한국 달력 날짜(연·월·일). */
export function kstParts(at: number) {
  const [year, month, day] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" })
    .format(at)
    .split("-")
    .map(Number);
  return { year, month, day };
}
const kstDayNumber = (at: number) => {
  const { year, month, day } = kstParts(at);
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
};
/** 1900-01-01 이 갑술일(60갑자 10번)인 기준. */
export function dayPillarAt(at: number): Pillar {
  const base = Math.floor(Date.UTC(1900, 0, 1) / 86400000);
  const index = (((kstDayNumber(at) - base + 10) % 60) + 60) % 60;
  return { heavenlyStem: stems[index % 10], earthlyBranch: branches[index % 12] };
}

/** 절(節) 시작 — 소한(축월)부터 대설(자월)까지 12개. */
const monthBranchOrder: Branch[] = ["축", "인", "묘", "진", "사", "오", "미", "신", "유", "술", "해", "자"];
type MonthTerm = { name: string; at: number; branch: Branch };
function monthTerms(year: number): MonthTerm[] {
  return getSolarTermsOfYear(year)
    .filter((term) => term.index % 2 === 0)
    .map((term) => ({
      name: term.name,
      at: term.date.getTime(),
      branch: monthBranchOrder[term.index / 2],
    }));
}

export function seoulDateLabel(at: number) {
  const { month, day } = kstParts(at);
  return `${month}.${day}`;
}

export type Season = {
  /** 사주에서 쓰는 해(입춘 기준) */
  year: number;
  yearPillar: Pillar;
  startAt: number;
  endAt: number;
};
export function seasonAt(at: number): Season {
  const { year } = kstParts(at);
  const spring = (y: number) => monthTerms(y).find((t) => t.branch === "인")!.at;
  const sajuYear = at >= spring(year) ? year : year - 1;
  const index = (((sajuYear - 4) % 60) + 60) % 60;
  return {
    year: sajuYear,
    yearPillar: { heavenlyStem: stems[index % 10], earthlyBranch: branches[index % 12] },
    startAt: spring(sajuYear),
    endAt: spring(sajuYear + 1),
  };
}

export type MonthSpan = {
  pillar: Pillar;
  /** 달력 월(이 절이 시작하는 달) */
  month: number;
  startAt: number;
  endAt: number;
  nextTerm: string;
};
/** 절기 달(월건). 지금 시각이 들어 있는 절기 달의 간지와 시작·끝. */
export function monthSpanAt(at: number): MonthSpan {
  const { year } = kstParts(at);
  const all = [...monthTerms(year - 1), ...monthTerms(year), ...monthTerms(year + 1)].sort(
    (a, b) => a.at - b.at,
  );
  const index = all.findLastIndex((term) => term.at <= at);
  const term = all[index];
  const next = all[index + 1];
  const season = seasonAt(at);
  // 월간: 오호둔(년간 5로 나눈 나머지 × 2 + 2)부터 인월에서 차례로 센다.
  const order = (monthBranchOrder.indexOf(term.branch) + 11) % 12; // 인월=0
  const stem = stems[(((stems.indexOf(season.yearPillar.heavenlyStem) % 5) * 2 + 2 + order) % 10)];
  return {
    pillar: { heavenlyStem: stem, earthlyBranch: term.branch },
    month: kstParts(term.at).month,
    startAt: term.at,
    endAt: next.at,
    nextTerm: next.name,
  };
}
