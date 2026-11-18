import type { ChemiProfile } from "./contracts/profile";

// 생일 입력의 순수 규칙(시트 11-2 · 04): 숫자 8자리에 점 붙이기, 실제 있는 날짜인지, 만 14세 미만 판정, 시간(정확·대략·모름)의 API 변환.
// 화면 글은 chemi.json 에 있고, 여기서는 값과 판정만 다룬다.

export type BirthCalendar = ChemiProfile["partners"][number]["calendar"];
export type BirthGender = ChemiProfile["partners"][number]["gender"];
export type BirthPrecision = ChemiProfile["partners"][number]["timePrecision"];

/** 시간 값. 모름 · 정확히(24시간제 시·분) · 대략(12시진 중 하나, 0번 자시). */
export type BirthTime = { kind: "unknown" } | { kind: "exact"; hour: number; minute: number } | { kind: "band"; band: number };

export const BAND_NAMES = ["자", "축", "인", "묘", "진", "사", "오", "미", "신", "유", "술", "해"] as const;
const pad = (value: number) => String(value).padStart(2, "0");

/** 시진 하나의 이름과 시각 범위: 자시 23:00–01:00, 축시 01:00–03:00 … */
export function bandInfo(band: number) {
  return { name: `${BAND_NAMES[band]}시`, range: `${pad((23 + band * 2) % 24)}:00–${pad((1 + band * 2) % 24)}:00` };
}

/** 한국 날짜(YYYY-MM-DD). 기기 시간대와 상관없이 한국 달력으로 본다. */
export function koreaToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** 숫자만 남겨 8자리까지 자르고 YYYY.MM.DD 로 점을 붙인다. */
export function formatBirthDigits(raw: string) {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  return [digits.slice(0, 4), digits.slice(4, 6), digits.slice(6, 8)].filter(Boolean).join(".");
}

export function birthTextToIso(text: string) {
  const digits = text.replace(/\D/g, "");
  return digits.length === 8 ? `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}` : null;
}

export function birthIsoToText(iso: string) {
  return iso.replaceAll("-", ".");
}

/** 'YYYY-MM-DD' 두 날짜로 만 나이를 센다(생일 당일부터 한 살 더). */
function ageOn(birthIso: string, todayIso: string) {
  const [by, bm, bd] = birthIso.split("-").map(Number);
  const [ty, tm, td] = todayIso.split("-").map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

export type BirthDateIssue = "incomplete" | "invalid" | "under14";

/** 입력 칸 한 줄 판정. null 이면 쓸 수 있는 날짜. 14세 미만은 '본인'일 때 안내 한 줄, 궁합 상대일 때는 같은 이유로 막는다(호출한 쪽이 문구를 고른다). */
export function birthDateIssue(text: string, today: string): BirthDateIssue | null {
  const iso = birthTextToIso(text);
  if (!iso) return "incomplete";
  const [year, month, day] = iso.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  const real = parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
  if (!real || year < 1900 || iso > today) return "invalid";
  return ageOn(iso, today) < 14 ? "under14" : null;
}

/** 휠이 정하는 달의 날 수(2월·윤년 포함). */
export function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function timeToApi(time: BirthTime): { birthTime: string | null; timePrecision: BirthPrecision } {
  if (time.kind === "exact") return { birthTime: `${pad(time.hour)}:${pad(time.minute)}`, timePrecision: "exact" };
  // 대략은 시진의 가운데 시각(자시 00:00, 축시 02:00 …)으로 저장해 풀이가 그 시진의 시주를 쓴다.
  if (time.kind === "band") return { birthTime: `${pad(time.band * 2)}:00`, timePrecision: "band" };
  return { birthTime: null, timePrecision: "unknown" };
}

export function timeFromApi(birthTime: string | null, precision: BirthPrecision): BirthTime {
  if (precision === "unknown" || !birthTime) return { kind: "unknown" };
  const [hour, minute] = birthTime.split(":").map(Number);
  return precision === "band" ? { kind: "band", band: Math.floor(hour / 2) } : { kind: "exact", hour, minute };
}

/** 오후 2:30 같은 12시간제 표기. 오전·오후 글자는 호출한 쪽이 준다. */
export function exactTimeLabel(hour: number, minute: number, am: string, pm: string) {
  return `${hour < 12 ? am : pm} ${hour % 12 || 12}:${pad(minute)}`;
}

/** 시간 값이 같은지(입력 판 저장 단추를 켜는 비교용). */
export function sameTime(a: BirthTime, b: BirthTime) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export type BirthDraft = {
  dateText: string;
  calendar: BirthCalendar;
  time: BirthTime;
  gender: BirthGender;
  /** 태어난 곳. 안 고른 상태는 null. */
  place: string | null;
};

export function draftFromBirth(birth: NonNullable<ChemiProfile["birth"]>): BirthDraft {
  return {
    dateText: birthIsoToText(birth.birthDate), calendar: birth.calendar, time: timeFromApi(birth.birthTime, birth.timePrecision),
    gender: birth.gender, place: birth.birthPlace,
  };
}

export const emptyDraft: BirthDraft = { dateText: "", calendar: "solar", time: { kind: "unknown" }, gender: null, place: null };

export function sameDraft(a: BirthDraft, b: BirthDraft) {
  return a.dateText === b.dateText && a.calendar === b.calendar && sameTime(a.time, b.time) && a.gender === b.gender && a.place === b.place;
}

/** PUT /profile/birth 요청 본문. */
export function birthRequest(draft: BirthDraft) {
  return {
    birthDate: birthTextToIso(draft.dateText) as string, calendar: draft.calendar, ...timeToApi(draft.time),
    gender: draft.gender, birthPlace: draft.place, consent: true as const,
  };
}
