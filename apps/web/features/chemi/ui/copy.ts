import type { AppLocale } from "@/i18n/locales";
/** The tab name stays in English in every language, like HOME and MY. */
const tabLabels: Record<AppLocale, string> = {
  ko: "Chemi", en: "Chemi", ja: "Chemi", "zh-Hans": "Chemi", "zh-Hant": "Chemi", es: "Chemi",
  id: "Chemi", vi: "Chemi", th: "Chemi", pt: "Chemi", fr: "Chemi", ru: "Chemi",
};
export function chemiTabLabel(locale: AppLocale) { return tabLabels[locale]; }
