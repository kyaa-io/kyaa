import type { computeDailyFortune } from "@/server/chemi-engine/fortune";
import type { FortuneCharacterId } from "../lines";
import { band } from "../result-copy";
import type { AppLocale } from "@/i18n/locales";

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

/**
 * 행운 값(색·방향·물건)은 서버가 한국어 이름으로 준다(server/chemi-engine/fortune/index.ts luck). 화면 언어로 바꿔 보인다.
 * 칸 순서: 초록 빨강 노랑 하양 검정 · 동 남 중앙 서 북 · 나무 연필 빨간 펜 도자기 컵 금속 책갈피 물병.
 */
const luckKeys = ["초록", "빨강", "노랑", "하양", "검정", "동", "남", "중앙", "서", "북", "나무 연필", "빨간 펜", "도자기 컵", "금속 책갈피", "물병"] as const;
const luckNames: Record<Exclude<AppLocale, "ko">, readonly string[]> = {
  en: ["Green", "Red", "Yellow", "White", "Black", "East", "South", "Center", "West", "North", "Wooden pencil", "Red pen", "Ceramic cup", "Metal bookmark", "Water bottle"],
  ja: ["緑", "赤", "黄色", "白", "黒", "東", "南", "中央", "西", "北", "木の鉛筆", "赤いペン", "陶器のカップ", "金属のしおり", "水筒"],
  "zh-Hans": ["绿色", "红色", "黄色", "白色", "黑色", "东", "南", "中央", "西", "北", "木铅笔", "红笔", "陶瓷杯", "金属书签", "水瓶"],
  "zh-Hant": ["綠色", "紅色", "黃色", "白色", "黑色", "東", "南", "中央", "西", "北", "木鉛筆", "紅筆", "陶瓷杯", "金屬書籤", "水瓶"],
  es: ["Verde", "Rojo", "Amarillo", "Blanco", "Negro", "Este", "Sur", "Centro", "Oeste", "Norte", "Lápiz de madera", "Bolígrafo rojo", "Taza de cerámica", "Marcapáginas metálico", "Botella de agua"],
  id: ["Hijau", "Merah", "Kuning", "Putih", "Hitam", "Timur", "Selatan", "Tengah", "Barat", "Utara", "Pensil kayu", "Pulpen merah", "Cangkir keramik", "Pembatas buku logam", "Botol air"],
  vi: ["Xanh lá", "Đỏ", "Vàng", "Trắng", "Đen", "Đông", "Nam", "Trung tâm", "Tây", "Bắc", "Bút chì gỗ", "Bút đỏ", "Cốc sứ", "Thẻ đánh dấu sách bằng kim loại", "Bình nước"],
  th: ["สีเขียว", "สีแดง", "สีเหลือง", "สีขาว", "สีดำ", "ตะวันออก", "ใต้", "กลาง", "ตะวันตก", "เหนือ", "ดินสอไม้", "ปากกาสีแดง", "ถ้วยเซรามิก", "ที่คั่นหนังสือโลหะ", "ขวดน้ำ"],
  pt: ["Verde", "Vermelho", "Amarelo", "Branco", "Preto", "Leste", "Sul", "Centro", "Oeste", "Norte", "Lápis de madeira", "Caneta vermelha", "Xícara de cerâmica", "Marcador de página de metal", "Garrafa de água"],
  fr: ["Vert", "Rouge", "Jaune", "Blanc", "Noir", "Est", "Sud", "Centre", "Ouest", "Nord", "Crayon en bois", "Stylo rouge", "Tasse en céramique", "Marque-page en métal", "Bouteille d’eau"],
  ru: ["Зелёный", "Красный", "Жёлтый", "Белый", "Чёрный", "Восток", "Юг", "Центр", "Запад", "Север", "Деревянный карандаш", "Красная ручка", "Керамическая чашка", "Металлическая закладка", "Бутылка для воды"],
  mn: ["Ногоон", "Улаан", "Шар", "Цагаан", "Хар", "Зүүн", "Өмнөд", "Төв", "Баруун", "Умард", "Модон харандаа", "Улаан үзэг", "Шаазан аяга", "Металл хавчуурга", "Усны сав"],
};

export function luckValue(value: string, locale: AppLocale) {
  if (locale === "ko") return value;
  const at = luckKeys.indexOf(value as (typeof luckKeys)[number]);
  return at < 0 ? value : luckNames[locale][at];
}
