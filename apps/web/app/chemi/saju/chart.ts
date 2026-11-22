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
export const branchElement: Record<Branch, Element> = {
  자: "water", 축: "earth", 인: "wood", 묘: "wood", 진: "earth", 사: "fire",
  오: "fire", 미: "earth", 신: "metal", 유: "metal", 술: "earth", 해: "water",
};
export const generates: Record<Element, Element> = {
  wood: "fire", fire: "earth", earth: "metal", metal: "water", water: "wood",
};
export const controls: Record<Element, Element> = {
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
  /** 서버가 기둥마다 함께 저장한 12운성·12신살(연지를 모르면 신살 없음). 옛 풀이에는 없을 수 있다. */
  details?: Partial<Record<"year" | "month" | "day" | "hour", { lifeStage?: string; spirit?: string | null } | null>>;
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

/**
 * 도움 기운. 신강 지수로 고른 억부 기운(balanceElements)을 쓴다 — 오늘의 운세와 같은 기준.
 * 월주를 몰라 지수를 못 내면 가장 적은 오행을 보고, 같으면 일간을 살리는(낳아 주는) 쪽을 먼저 본다.
 */
export function helpingElement(chart: Chart): Element {
  const balance = balanceElements(chart);
  if (balance) return balance.useful;
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

/* ───────────── 전문 풀이용 계산(8글자에서만 나온다) ───────────── */

export type PillarKey = "year" | "month" | "day" | "hour";
/** 명식표 순서(오른쪽부터 년·월·일·시를 왼쪽부터 시·일·월·년으로). */
export const pillarKeys: readonly PillarKey[] = ["hour", "day", "month", "year"];
const presentPillars = (chart: Chart) =>
  pillarKeys.flatMap((key) => (chart.pillars[key] ? [{ key, pillar: chart.pillars[key]! }] : []));

/**
 * 지장간 비중(월률분야, 한 달 30일 기준 일수). 여기·중기·정기 순, 마지막이 정기.
 * 지지 한 글자의 힘을 이 비율대로 나눠 오행 비율·신강 지수에 쓴다.
 */
export const hiddenStemDays: Record<Branch, readonly (readonly [Stem, number])[]> = {
  자: [["임", 10], ["계", 20]],
  축: [["계", 9], ["신", 3], ["기", 18]],
  인: [["무", 7], ["병", 7], ["갑", 16]],
  묘: [["갑", 10], ["을", 20]],
  진: [["을", 9], ["계", 3], ["무", 18]],
  사: [["무", 7], ["경", 7], ["병", 16]],
  오: [["병", 10], ["기", 9], ["정", 11]],
  미: [["정", 9], ["을", 3], ["기", 18]],
  신: [["무", 7], ["임", 7], ["경", 16]],
  유: [["경", 10], ["신", 20]],
  술: [["신", 9], ["정", 3], ["무", 18]],
  해: [["무", 7], ["갑", 7], ["임", 16]],
};
/** 지지의 정기(본기). 지지 십신은 정기로 본다(manseryeok BRANCH_MAIN_STEM 과 같다). */
export const mainStem = (branch: Branch): Stem => hiddenStemDays[branch].at(-1)![0];

function branchShares(branch: Branch): Record<Element, number> {
  const share: Record<Element, number> = { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 };
  for (const [stem, days] of hiddenStemDays[branch]) share[stemElement[stem]] += days / 30;
  return share;
}

/** 합이 정확히 100 이 되게 반올림한다(나머지가 큰 쪽부터 1씩). */
function toPercent(values: Record<Element, number>): Record<Element, number> {
  const total = elements.reduce((sum, element) => sum + values[element], 0);
  const raw = elements.map((element) => (values[element] / total) * 100);
  const floors = raw.map(Math.floor);
  let rest = 100 - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((value, i) => [value - floors[i], i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) if (rest-- > 0) floors[i] += 1;
  return Object.fromEntries(elements.map((element, i) => [element, floors[i]])) as Record<Element, number>;
}

/**
 * 오행 비율(%). 천간은 한 글자 1, 지지는 1 을 지장간 비중대로 나눈다.
 * 예: 축(丑)은 흙 0.6 · 물 0.3 · 쇠 0.1.
 */
export function elementRatio(chart: Chart): Record<Element, number> {
  const sum: Record<Element, number> = { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 };
  for (const { pillar } of presentPillars(chart)) {
    sum[stemElement[pillar.heavenlyStem]] += 1;
    const share = branchShares(pillar.earthlyBranch);
    for (const element of elements) sum[element] += share[element];
  }
  return toPercent(sum);
}

/** 신강 지수 가중치: 월지(월령) 3, 일지 1.5, 연지·시지 1, 천간(일간 제외) 1. */
export const strengthWeights = { monthBranch: 3, dayBranch: 1.5, otherBranch: 1, stem: 1 } as const;
/**
 * 다섯 기운 중 둘(비겁·인성)이 고르게 섞이면 몫이 40% 다. 이 균형점을 지수 50 으로 맞춘다(몫 × 1.25, 100 상한).
 * 신강·중화·신약 경계는 1950~2025 생일 분포에서 셋이 고르게 나뉘도록 정했다(saju-samples 시험).
 */
export const strengthScale = 1.25;
export const strengthBands = { weakBelow: 42, strongFrom: 58 } as const;
export type StrengthClass = "신강" | "중화" | "신약";
export type Strength = {
  /** 0~100(50 = 균형). 나와 같은 기운(비겁)과 나를 낳는 기운(인성)이 차지하는 몫 */
  index: number;
  class: StrengthClass;
  /** 도움 기운을 고를 때 쓰는 쪽. 중화도 지수 50 을 기준으로 한쪽을 고른다 */
  leansStrong: boolean;
  /** 나를 돕는 글자 수 : 덜어 내는 글자 수(일간 제외, 지지는 정기 기준) */
  helpers: number;
  drainers: number;
  /** 월지 정기가 나를 돕는가(득령) */
  seasonHelps: boolean;
};

/**
 * 신강·신약. 월령(월지)·뿌리(일지)·세력(나머지 글자)을 가중해 나를 돕는 몫을 0~100 으로 본다.
 * 월주를 모르면(절기 당일 + 시간 모름) 계산하지 않는다.
 */
export function strengthOf(chart: Chart): Strength | null {
  const month = chart.pillars.month;
  if (!month) return null;
  const own = stemElement[dayStem(chart)];
  const mother = elements.find((element) => generates[element] === own)!;
  const helps = (element: Element) => element === own || element === mother;
  let support = 0;
  let total = 0;
  let helpers = 0;
  let drainers = 0;
  for (const { key, pillar } of presentPillars(chart)) {
    if (key !== "day") {
      total += strengthWeights.stem;
      if (helps(stemElement[pillar.heavenlyStem])) {
        support += strengthWeights.stem;
        helpers++;
      } else drainers++;
    }
    const weight =
      key === "month" ? strengthWeights.monthBranch : key === "day" ? strengthWeights.dayBranch : strengthWeights.otherBranch;
    const share = branchShares(pillar.earthlyBranch);
    total += weight;
    support += weight * (share[own] + share[mother]);
    if (helps(stemElement[mainStem(pillar.earthlyBranch)])) helpers++;
    else drainers++;
  }
  const index = Math.min(100, Math.round((support / total) * 100 * strengthScale));
  return {
    index,
    class: index >= strengthBands.strongFrom ? "신강" : index < strengthBands.weakBelow ? "신약" : "중화",
    leansStrong: index >= 50,
    helpers,
    drainers,
    seasonHelps: helps(stemElement[mainStem(month.earthlyBranch)]),
  };
}

/**
 * 억부(抑扶)로 고른 도움·보조·부담 기운. 사주 화면·오늘의 운세·질문하기가 모두 이 함수를 쓴다.
 * 강한 쪽이면 나를 다잡는 기운(관성)이 돕고 재성이 보조, 같은 기운이 부담.
 * 약한 쪽이면 나를 낳는 기운(인성)이 돕고 같은 기운이 보조, 관성이 부담.
 */
export function balanceElements(chart: Chart) {
  const own = stemElement[dayStem(chart)];
  const mother = elements.find((element) => generates[element] === own)!;
  const officer = elements.find((element) => controls[element] === own)!;
  const strength = strengthOf(chart);
  if (!strength) return null;
  return strength.leansStrong
    ? { strength, useful: officer, supportive: controls[own], adverse: own }
    : { strength, useful: mother, supportive: own, adverse: officer };
}

export const tenGodGroups = ["비겁", "식상", "재성", "관성", "인성"] as const;
export type TenGodGroup = (typeof tenGodGroups)[number];
export const groupOf = (god: TenGod): TenGodGroup => tenGodGroups[Math.floor(tenGods.indexOf(god) / 2)];

export type TenGodCell = { key: PillarKey; place: "stem" | "branch"; letter: Stem | Branch; god: TenGod };
/** 일간을 뺀 글자(최대 7자)의 십신. 지지는 정기로 본다. */
export function tenGodCells(chart: Chart): TenGodCell[] {
  const day = dayStem(chart);
  return presentPillars(chart).flatMap(({ key, pillar }) => [
    ...(key === "day" ? [] : [{ key, place: "stem" as const, letter: pillar.heavenlyStem, god: tenGod(day, pillar.heavenlyStem) }]),
    { key, place: "branch" as const, letter: pillar.earthlyBranch, god: tenGod(day, mainStem(pillar.earthlyBranch)) },
  ]);
}
/** 십신 5묶음 개수와 묶음 안의 편·정 개수. */
export function tenGodDistribution(chart: Chart) {
  const cells = tenGodCells(chart);
  return tenGodGroups.map((group, i) => {
    const inGroup = cells.filter((cell) => groupOf(cell.god) === group);
    return {
      group,
      count: inGroup.length,
      gods: tenGods.slice(i * 2, i * 2 + 2).map((god) => ({ god, count: inGroup.filter((cell) => cell.god === god).length })),
    };
  });
}

export type ChartRelationKind = "천간합" | "천간충" | "방합" | "삼합" | "반합" | "육합" | "충" | "형" | "자형";
export type ChartRelation = { kind: ChartRelationKind; letters: string; keys: PillarKey[]; element?: Element };
const stemCombos: readonly (readonly [Stem, Stem, Element])[] = [
  ["갑", "기", "earth"], ["을", "경", "metal"], ["병", "신", "water"], ["정", "임", "wood"], ["무", "계", "fire"],
];
const stemClashes: readonly (readonly [Stem, Stem])[] = [["갑", "경"], ["을", "신"], ["병", "임"], ["정", "계"]];
const sixCombos: readonly (readonly [Branch, Branch, Element])[] = [
  ["자", "축", "earth"], ["인", "해", "wood"], ["묘", "술", "fire"], ["진", "유", "metal"], ["사", "신", "water"], ["오", "미", "fire"],
];
/** 삼합 무리: 생지·왕지·고지. 가운데 왕지가 낀 두 글자는 반합. */
const trioCombos: readonly (readonly [Branch, Branch, Branch, Element])[] = [
  ["신", "자", "진", "water"], ["해", "묘", "미", "wood"], ["인", "오", "술", "fire"], ["사", "유", "축", "metal"],
];
const seasonCombos: readonly (readonly [Branch, Branch, Branch, Element])[] = [
  ["인", "묘", "진", "wood"], ["사", "오", "미", "fire"], ["신", "유", "술", "metal"], ["해", "자", "축", "water"],
];
/** 형: 인사신·축술미(두 글자도 형으로 본다), 자묘 상형. 진·오·유·해가 겹치면 자형. */
const punishGroups: readonly (readonly Branch[])[] = [["인", "사", "신"], ["축", "술", "미"], ["자", "묘"]];
const selfPunish: readonly Branch[] = ["진", "오", "유", "해"];

/**
 * 원국 안의 합·충·형 전체. 어느 기둥끼리인지 함께 돌려준다.
 * 순서: 천간합 → 천간충 → 방합 → 삼합 → 반합 → 육합 → 충 → 형 → 자형.
 */
export function chartRelations(chart: Chart): ChartRelation[] {
  const cells = presentPillars(chart);
  const out: ChartRelation[] = [];
  type Side = { key: PillarKey; v: string };
  const pairsOf = (pick: (p: Pillar) => string) =>
    cells.flatMap((a, i) =>
      cells.slice(i + 1).map((b) => [{ key: a.key, v: pick(a.pillar) }, { key: b.key, v: pick(b.pillar) }] as [Side, Side]),
    );
  const stemPairs = pairsOf((p) => p.heavenlyStem);
  const branchPairs = pairsOf((p) => p.earthlyBranch);
  const is = ([a, b]: [Side, Side], x: string, y: string) => (a.v === x && b.v === y) || (a.v === y && b.v === x);
  const add = (kind: ChartRelationKind, [a, b]: [Side, Side], element?: Element) =>
    out.push({ kind, letters: a.v + b.v, keys: [a.key, b.key], ...(element ? { element } : {}) });

  for (const [x, y, element] of stemCombos) for (const p of stemPairs) if (is(p, x, y)) add("천간합", p, element);
  for (const [x, y] of stemClashes) for (const p of stemPairs) if (is(p, x, y)) add("천간충", p);

  const keysOf = (branch: Branch) => cells.filter((c) => c.pillar.earthlyBranch === branch).map((c) => c.key);
  for (const [x, y, z, element] of seasonCombos)
    if ([x, y, z].every((b) => keysOf(b).length)) out.push({ kind: "방합", letters: x + y + z, keys: [x, y, z].flatMap(keysOf), element });
  for (const [x, y, z, element] of trioCombos) {
    if ([x, y, z].every((b) => keysOf(b).length)) {
      out.push({ kind: "삼합", letters: x + y + z, keys: [x, y, z].flatMap(keysOf), element });
      continue;
    }
    for (const [a, b] of [[x, y], [y, z]] as const)
      if (keysOf(a).length && keysOf(b).length) out.push({ kind: "반합", letters: a + b, keys: [...keysOf(a), ...keysOf(b)], element });
  }
  for (const [x, y, element] of sixCombos) for (const p of branchPairs) if (is(p, x, y)) add("육합", p, element);
  for (const p of branchPairs) if (clash(p[0].v as Branch) === p[1].v) add("충", p);
  for (const group of punishGroups)
    for (const p of branchPairs)
      if (p[0].v !== p[1].v && group.includes(p[0].v as Branch) && group.includes(p[1].v as Branch)) add("형", p);
  for (const p of branchPairs) if (p[0].v === p[1].v && selfPunish.includes(p[0].v as Branch)) add("자형", p);
  return out;
}

/** 60갑자 순번(갑자 = 0). */
export function sexagenaryIndex(pillar: Pillar) {
  const s = stems.indexOf(pillar.heavenlyStem);
  const b = branches.indexOf(pillar.earthlyBranch);
  for (let i = s; i < 60; i += 10) if (i % 12 === b) return i;
  throw new RangeError("올바르지 않은 간지");
}
export function pillarAt(index: number): Pillar {
  const i = ((index % 60) + 60) % 60;
  return { heavenlyStem: stems[i % 10], earthlyBranch: branches[i % 12] };
}

/** 일주 기준 공망 지지 2개(순중공망)와 원국에서 공망에 든 기둥(일주 제외). */
export function voidOf(chart: Chart) {
  const index = sexagenaryIndex(chart.pillars.day!);
  const start = index - (index % 10); // 이 순(旬)의 첫 갑
  const pair: [Branch, Branch] = [branches[(start + 10) % 12], branches[(start + 11) % 12]];
  const keys = presentPillars(chart)
    .filter(({ key, pillar }) => key !== "day" && pair.includes(pillar.earthlyBranch))
    .map(({ key }) => key);
  return { branches: pair, keys };
}

export type LuckRow = { age: number; pillar: Pillar; stemGod: TenGod; branchGod: TenGod; current: boolean };
/**
 * 대운 표(10년 간지). 서버가 시간·성별을 알 때만 계산해 저장한다.
 * currentAge(만 나이)를 주면 지금 대운 칸을 표시한다.
 */
export function luckTable(chart: Chart, currentAge?: number): LuckRow[] | null {
  const luck = chart.luckPillars;
  if (!luck) return null;
  const day = dayStem(chart);
  return luck.pillars.map((row, i) => ({
    age: row.age,
    pillar: row.pillar,
    stemGod: tenGod(day, row.pillar.heavenlyStem),
    branchGod: tenGod(day, mainStem(row.pillar.earthlyBranch)),
    current:
      currentAge != null && currentAge >= row.age && (i === luck.pillars.length - 1 || currentAge < luck.pillars[i + 1].age),
  }));
}

export type YearRow = { year: number; pillar: Pillar; stemGod: TenGod; branchGod: TenGod; withDayBranch: Relation };
/** 세운 표: fromYear 부터 count 해의 간지(입춘 기준 해)와 일간 기준 십신, 일지와의 관계. */
export function yearTable(chart: Chart, fromYear: number, count = 10): YearRow[] {
  const day = dayStem(chart);
  return Array.from({ length: count }, (_, i) => {
    const year = fromYear + i;
    const pillar = pillarAt(year - 4);
    return {
      year,
      pillar,
      stemGod: tenGod(day, pillar.heavenlyStem),
      branchGod: tenGod(day, mainStem(pillar.earthlyBranch)),
      withDayBranch: branchRelation(dayBranch(chart), pillar.earthlyBranch),
    };
  });
}

/* ───────────── 명식표 표시용 한자(계산에는 쓰지 않는다) ───────────── */

export const stemHanja: Record<Stem, string> = {
  갑: "甲", 을: "乙", 병: "丙", 정: "丁", 무: "戊", 기: "己", 경: "庚", 신: "辛", 임: "壬", 계: "癸",
};
export const branchHanja: Record<Branch, string> = {
  자: "子", 축: "丑", 인: "寅", 묘: "卯", 진: "辰", 사: "巳", 오: "午", 미: "未", 신: "申", 유: "酉", 술: "戌", 해: "亥",
};
export const elementHanja: Record<Element, string> = { wood: "木", fire: "火", earth: "土", metal: "金", water: "水" };
/**
 * 한글 글자를 한자로. 신(辛·申)처럼 천간·지지에 모두 있는 글자가 있어 어느 쪽인지 받는다.
 * pillar 는 앞 글자가 천간, 뒤 글자가 지지인 간지다.
 */
export function toHanja(letters: string, kind: "stem" | "branch" | "pillar") {
  return [...letters]
    .map((letter, i) =>
      kind === "stem" || (kind === "pillar" && i === 0) ? stemHanja[letter as Stem] : branchHanja[letter as Branch],
    )
    .join("");
}

export type FlowRelation = ChartRelation & {
  /** 원국 쪽 기둥(흐름 글자를 뺀 자리) */
  natal: PillarKey[];
};
/**
 * 세운·월운 한 기둥이 원국과 맺는 합·충·형. chartRelations 를 그대로 쓴다:
 * 원국 기둥 하나를 비운 자리에 흐름 기둥을 넣은 명식마다 계산해, 흐름 글자가 낀 관계만 모은다.
 * 같은 무리의 삼합이 있으면 그 안의 반합은 뺀다.
 */
export function flowRelations(chart: Chart, flow: Pillar): FlowRelation[] {
  const known = pillarKeys.filter((key) => chart.pillars[key]);
  const empty = pillarKeys.find((key) => !chart.pillars[key]);
  const trials: { slot: PillarKey; drop: PillarKey | null }[] = empty ? [{ slot: empty, drop: null }] : [];
  for (const key of known) trials.push({ slot: key, drop: key });
  const out = new Map<string, FlowRelation>();
  for (const { slot, drop } of trials) {
    const pillars = { ...chart.pillars, [slot]: flow };
    for (const relation of chartRelations({ ...chart, pillars })) {
      if (!relation.keys.includes(slot)) continue;
      // 비운 자리(slot)가 원래 원국 기둥이면, 그 기둥 글자로 맺은 관계가 아니라 흐름 글자로 맺은 관계다.
      const natal = relation.keys.filter((key) => key !== slot);
      if (drop && natal.includes(drop)) continue;
      const id = `${relation.kind}:${relation.letters}:${[...natal].sort().join(",")}`;
      out.set(id, { ...relation, natal });
    }
  }
  const list = [...out.values()];
  return list.filter(
    (relation) =>
      relation.kind !== "반합" ||
      !list.some((other) => other.kind === "삼합" && [...relation.letters].every((letter) => other.letters.includes(letter))),
  );
}
