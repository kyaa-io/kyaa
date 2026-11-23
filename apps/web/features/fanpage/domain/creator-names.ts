import type { AppLocale } from "@/i18n/locales";

/**
 * 크리에이터·케미 캐릭터 이름의 언어별 표기(CREATOR-NAME-I18N-1122).
 * DB(celebrity_localizations)에는 ko·en 두 칸만 있어서, 다른 언어 화면은 여기 표기를 먼저 쓴다.
 * 창하·엘리나·유나 표기는 케미 게임 문구(app/chemi/games)와 board p2c-plan chemi-copy-i18n 기준과 같다.
 * 라틴 문자 언어·중국어는 영문 표기를 쓰고(한자 이름을 지어내지 않음), 일본어는 가타카나, 태국어·러시아어는 음역.
 * 영문 브랜드 표기(NCHIVE·We;Na·ARYEOM·GGGI·ifew 등)는 표에 넣지 않고 저장된 이름을 그대로 쓴다.
 */
type NameRow = { ko: string; latin: string; ja?: string; th?: string; ru?: string };

const rows: Readonly<Record<string, NameRow>> = {
  changha: { ko: "창하", latin: "Changha", ja: "チャンハ", th: "ชางฮา", ru: "Чанха" },
  elina: { ko: "엘리나", latin: "Elina", ja: "エリナ", th: "เอลินา", ru: "Элина" },
  yuna: { ko: "유나", latin: "Yuna", ja: "ユナ", th: "ยูนา", ru: "Юна" },
  dosa: { ko: "kyaa 도사", latin: "kyaa Dosa", ja: "kyaa ドサ", th: "kyaa โดซา", ru: "kyaa Доса" },
  "jenny-jeong": { ko: "정제니", latin: "Jenny Jeong", ja: "ジェニー・チョン", th: "เจนนี่ จอง", ru: "Дженни Чон" },
  "park-myungho": { ko: "박명호", latin: "Myungho Park", ja: "パク・ミョンホ", th: "พัก มย็องโฮ", ru: "Пак Мёнхо" },
  hyunji: { ko: "현지", latin: "Hyunji", ja: "ヒョンジ", th: "ฮยอนจี", ru: "Хёнджи" },
  "thisisj-official": { ko: "재희", latin: "Jaehee", ja: "ジェヒ", th: "แจฮี", ru: "Джэхи" },
};

/**
 * 화면에 보일 이름: 일본어·태국어·러시아어는 이 표의 표기, 그 밖은 서버가 준 이름(ko 화면은 ko, 그 밖은 en 칸) → 이 표 → slug.
 * ko 화면은 늘 한국어 이름이라 한국어 대사(조사 포함)는 그대로다.
 */
export function creatorName(slug: string, locale: AppLocale, stored?: string | null): string {
  const row = Object.hasOwn(rows, slug) ? rows[slug] : undefined;
  if (row) {
    if (locale === "ko") return stored?.trim() || row.ko;
    if (locale === "ja" || locale === "th" || locale === "ru") return row[locale] ?? row.latin;
    return stored?.trim() || row.latin;
  }
  return stored?.trim() || slug;
}

/** 표에 언어별 표기가 있는 slug(시험·누락 검사용). */
export const creatorNameSlugs: readonly string[] = Object.keys(rows);
