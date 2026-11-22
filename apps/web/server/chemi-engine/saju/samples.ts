/**
 * 시험 전용: 사주 표본 200건과 독립 엔진(lunar-javascript) 대조.
 * 표본은 고정 씨앗으로 만들어 매번 같다. 서버 코드에서 가져다 쓰지 않는다.
 */
import { createRequire } from "node:module";
import { equationOfTimeMinutes, getSolarTermsOfYear } from "manseryeok";

const { Solar, Lunar, LunarYear } = createRequire(import.meta.url)("lunar-javascript");

/** 한국 음력과 중국 음력의 윤달 위치가 다른 해(1930~2020). */
export const KOREA_CHINA_LEAP_DIFF = [2012, 2017];

export type Sample = {
  id: number;
  kind: "절입" | "밤11시" | "서머타임" | "옛표준시" | "윤달" | "시경계" | "무작위";
  /** 입력 그대로(윤달이면 음력) */
  year: number; month: number; day: number; hour: number; minute: number;
  isLunar?: boolean; isLeapMonth?: boolean;
  gender: "male" | "female";
};

const HANJA: Record<string, string> = {
  甲: "갑", 乙: "을", 丙: "병", 丁: "정", 戊: "무", 己: "기", 庚: "경", 辛: "신", 壬: "임", 癸: "계",
  子: "자", 丑: "축", 寅: "인", 卯: "묘", 辰: "진", 巳: "사", 午: "오", 未: "미", 申: "신", 酉: "유", 戌: "술", 亥: "해",
};
export const toKorean = (ganzhi: string) => [...ganzhi].map((c) => HANJA[c] ?? c).join("");

function random(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 한국 벽시계(역사적 표준시·서머타임 포함, tzdb)의 연월일시분. */
function seoulWall(ms: number) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul", hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric",
  }).formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}
/** 한국 벽시계 → UTC 순간(tzdb). 독립 계산용이라 manseryeok 의 표를 쓰지 않는다. */
export function seoulInstant(year: number, month: number, day: number, hour: number, minute: number) {
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  let utc = wall - 9 * 3600000;
  for (let i = 0; i < 3; i++) {
    const w = seoulWall(utc);
    utc += wall - Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute);
  }
  return utc;
}

export function buildSamples(): Sample[] {
  const rnd = random(20261123);
  const pick = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
  const out: Sample[] = [];
  const add = (s: Omit<Sample, "id" | "gender">) => out.push({ ...s, id: out.length + 1, gender: out.length % 2 ? "female" : "male" });
  const safeDay = (y: number, m: number) => pick(1, new Date(Date.UTC(y, m, 0)).getUTCDate());

  // 절입(절기 중 '절') 1분 전·1분 후 20쌍
  for (let i = 0; i < 20; i++) {
    const y = pick(1930, 2020);
    const terms = getSolarTermsOfYear(y).filter((t) => t.index % 2 === 0);
    const term = terms[pick(0, terms.length - 1)];
    for (const offset of [-1, 1]) {
      const w = seoulWall(term.date.getTime() + offset * 60000);
      add({ kind: "절입", ...w });
    }
  }
  // 밤 11시(보정 뒤 23시) 앞뒤: 벽시계 22:58~23:02, 23:28~23:36
  for (let i = 0; i < 20; i++) {
    const y = pick(1962, 2020), m = pick(1, 12);
    const [hour, minute] = i % 2 ? [23, pick(28, 36)] : [pick(0, 1) ? 23 : 22, pick(0, 1) ? pick(0, 2) : pick(58, 59)];
    add({ kind: "밤11시", year: y, month: m, day: safeDay(y, m), hour, minute });
  }
  // 서머타임 기간 30건(1948~51·1955~60·1987~88, 7~8월 한가운데)
  const dstYears = [1948, 1949, 1950, 1951, 1955, 1956, 1957, 1958, 1959, 1960, 1987, 1988];
  for (let i = 0; i < 30; i++) {
    const y = dstYears[i % dstYears.length];
    add({ kind: "서머타임", year: y, month: pick(7, 8), day: pick(1, 28), hour: pick(4, 21), minute: pick(0, 59) });
  }
  // 옛 표준시(UTC+8:30, 1954-03-21~1961-08-09) 20건, 서머타임 달은 피함
  for (let i = 0; i < 20; i++) {
    const y = pick(1955, 1960), m = [1, 2, 3, 4, 10, 11, 12][pick(0, 6)];
    add({ kind: "옛표준시", year: y, month: m, day: pick(1, 28), hour: pick(0, 23), minute: pick(0, 59) });
  }
  // 음력 윤달 20건
  const leapYears: number[] = [];
  // 한국(KASI)과 중국 음력의 윤달이 다른 해(2012 윤3월↔윤4월, 2017 윤5월↔윤6월)는 빼고 고른다.
  for (let y = 1930; y <= 2020; y++) if (LunarYear.fromYear(y).getLeapMonth() && !KOREA_CHINA_LEAP_DIFF.includes(y)) leapYears.push(y);
  for (let i = 0; i < 20; i++) {
    const y = leapYears[Math.floor((i * leapYears.length) / 20)];
    const leap = LunarYear.fromYear(y).getLeapMonth();
    // 윤달은 29일까지만 있는 해가 있어 28일까지 고른다.
    add({ kind: "윤달", year: y, month: leap, day: pick(1, 28), hour: pick(0, 23), minute: pick(0, 59), isLunar: true, isLeapMonth: true });
  }
  // 시(時) 경계 앞뒤 20분: 벽시계 홀수시 + 32분 ± 20분 40건(1962년 이후 표준시)
  for (let i = 0; i < 40; i++) {
    const y = pick(1962, 2020), m = pick(1, 12);
    const base = (pick(0, 10) * 2 + 1) * 60 + 32 + pick(-20, 20);
    add({ kind: "시경계", year: y, month: m, day: safeDay(y, m), hour: Math.floor(base / 60) % 24, minute: base % 60 });
  }
  // 1930~2020 무작위 30건
  for (let i = 0; i < 30; i++) {
    const y = pick(1930, 2020), m = pick(1, 12);
    add({ kind: "무작위", year: y, month: m, day: safeDay(y, m), hour: pick(0, 23), minute: pick(0, 59) });
  }
  return out;
}

/** 양력 날짜. 윤달 표본은 독립 엔진으로 변환한다. */
export function independentSolar(s: Sample) {
  if (!s.isLunar) return { year: s.year, month: s.month, day: s.day };
  const solar = Lunar.fromYmd(s.year, s.isLeapMonth ? -s.month : s.month, s.day).getSolar();
  return { year: solar.getYear(), month: solar.getMonth(), day: solar.getDay() };
}

/**
 * 독립 계산: tzdb 로 순간을 구하고, 연·월주는 그 순간(중국 표준시 벽시계)으로,
 * 일·시주는 서울 지방 평균태양시(경도 126.978, 균시차 선택)로 lunar-javascript 에 넣는다.
 */
export function independentPillars(s: Sample, applyEquationOfTime: boolean) {
  const d = independentSolar(s);
  const instant = seoulInstant(d.year, d.month, d.day, s.hour, s.minute);
  const china = new Date(instant + 8 * 3600000);
  const ym = Solar.fromYmdHms(china.getUTCFullYear(), china.getUTCMonth() + 1, china.getUTCDate(), china.getUTCHours(), china.getUTCMinutes(), china.getUTCSeconds()).getLunar();
  const eot = applyEquationOfTime ? equationOfTimeMinutes(instant) : 0;
  const local = new Date(instant + (126.978 * 4 + eot) * 60000);
  const dh = Solar.fromYmdHms(local.getUTCFullYear(), local.getUTCMonth() + 1, local.getUTCDate(), local.getUTCHours(), local.getUTCMinutes(), local.getUTCSeconds()).getLunar();
  return {
    solar: d,
    localTime: `${String(local.getUTCHours()).padStart(2, "0")}:${String(local.getUTCMinutes()).padStart(2, "0")}`,
    pillars: [ym.getYearInGanZhiExact(), ym.getMonthInGanZhiExact(), dh.getDayInGanZhiExact(), dh.getTimeInGanZhi()].map(toKorean),
  };
}

/** 독립 엔진의 대운 방향(순행 여부). */
export function independentLuckForward(s: Sample) {
  const d = independentSolar(s);
  const instant = seoulInstant(d.year, d.month, d.day, s.hour, s.minute);
  const china = new Date(instant + 8 * 3600000);
  const lunar = Solar.fromYmdHms(china.getUTCFullYear(), china.getUTCMonth() + 1, china.getUTCDate(), china.getUTCHours(), china.getUTCMinutes(), 0).getLunar();
  return lunar.getEightChar().getYun(s.gender === "male" ? 1 : 0).isForward() as boolean;
}
