import type { AppLocale } from "@/i18n/locales";
/** Page head: the toggle under a two-line introduction. */
const values: Record<AppLocale, readonly [string, string]> = {
  ko: ["더 보기", "접기"], en: ["More", "Less"], ja: ["もっと見る", "閉じる"], "zh-Hans": ["展开", "收起"], "zh-Hant": ["展開", "收起"],
  es: ["Ver más", "Ver menos"], id: ["Selengkapnya", "Sembunyikan"], vi: ["Xem thêm", "Thu gọn"], th: ["ดูเพิ่มเติม", "ย่อ"],
  pt: ["Ver mais", "Ver menos"], fr: ["Voir plus", "Voir moins"], ru: ["Ещё", "Свернуть"],
};
export function pageHeadCopy(locale: AppLocale) { const [more, less] = values[locale]; return { more, less }; }
