import type { AppLocale } from "@/i18n/locales";
/** Korean uses 케미; other locales retain the English menu name, like HOME and MY. */
const tabLabels: Record<AppLocale, string> = {
  ko: "케미", get mn() { return this.en; }, en: "Chemi", ja: "Chemi", "zh-Hans": "Chemi", "zh-Hant": "Chemi", es: "Chemi",
  id: "Chemi", vi: "Chemi", th: "Chemi", pt: "Chemi", fr: "Chemi", ru: "Chemi",
};
export function chemiTabLabel(locale: AppLocale) { return tabLabels[locale]; }

/** MY 바로가기의 '내 생일 정보' 줄: 이름과 값이 없을 때의 글. 한국어가 원문이고 다른 언어는 번역 전이라 짧은 영어를 쓴다. */
export function chemiMyShortcutText(locale: AppLocale) {
  return locale === "ko" ? { label: "내 생일 정보", none: "입력 전" } : { label: "Birth info", none: "Not set" };
}
