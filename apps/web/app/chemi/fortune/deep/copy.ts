import type { computeDailyFortune } from "@/server/chemi-engine/fortune";
import type { FortuneCharacterId } from "../lines";
import { band } from "../result-copy";

export type FortuneDay = { day: string; result: ReturnType<typeof computeDailyFortune> };
export type OpenDay = { day: string; result: Extract<FortuneDay["result"], { locked: false }> };

/** 기념 카드는 아주 좋은 날(90~98), 응원 부적은 쉬어 가는 날(50~59)에만 나온다. 날마다 하나뿐이다. */
export function dayCardKind(score: number) {
  return score >= 90 ? "keepsake" : score < 60 ? "amulet" : null;
}

export const gradeKey = (score: number) =>
  score >= 90 ? "gradePeak" : score >= 80 ? "gradeGood" : score >= 70 ? "gradeEven" : score >= 60 ? "gradeCare" : "gradeRest";
export const flowKey = (score: number) =>
  score >= 90 ? "flowPeak" : score >= 80 ? "flowGood" : score >= 70 ? "flowEven" : score >= 60 ? "flowCare" : "flowRest";

/** 점수 다섯 등급 → 막대·칸 색 단계(2~5). 60 미만과 60대는 같은 흰 칸이다. */
export const scoreLevel = (score: number) => (score >= 90 ? 5 : score >= 80 ? 4 : score >= 70 ? 3 : 2);

const periodKeys = {
  morning: { high: "periodMorningHigh", mid: "periodMorningMid", low: "periodMorningLow" },
  afternoon: { high: "periodAfternoonHigh", mid: "periodAfternoonMid", low: "periodAfternoonLow" },
  night: { high: "periodNightHigh", mid: "periodNightMid", low: "periodNightLow" },
} as const;
export const periodKey = (period: keyof typeof periodKeys, score: number) => periodKeys[period][band(score)];

/** 말투: 창하·유나 반말, 엘리나 요체, 도사 하오체(타로·사주와 같은 구분). */
const voices = { changha: "Ban", yuna: "Ban", elina: "Yo", dosa: "Hao" } as const;
export const voiced = <T extends string>(key: T, character: FortuneCharacterId) =>
  `${key}${voices[character]}` as `${T}${(typeof voices)[FortuneCharacterId]}`;

export const deepArt = (kind: "keep" | "care" | "tomorrow", character: FortuneCharacterId) =>
  `/chemi/fortune/card/${kind}-${character}-v1.webp`;
export const AMULET_PAPER = "/chemi/fortune/card/amulet-paper-v1.webp";

/** YYYY-MM-DD 를 그 날짜 그대로(시간대 변환 없이) 보여 준다. */
export { calendarLabel as dayLabel } from "@/features/chemi/i18n/calendar-label";
export const dotted = (day: string) => day.replaceAll("-", ".");

export function isOpenDay(row: FortuneDay): row is OpenDay {
  return row.result.locked === false;
}
