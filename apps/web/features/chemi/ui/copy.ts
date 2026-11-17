import type { AppLocale } from "@/i18n/locales";
/** Korean uses 케미; other locales retain the English menu name, like HOME and MY. */
const tabLabels: Record<AppLocale, string> = {
  ko: "케미", en: "Chemi", ja: "Chemi", "zh-Hans": "Chemi", "zh-Hant": "Chemi", es: "Chemi",
  id: "Chemi", vi: "Chemi", th: "Chemi", pt: "Chemi", fr: "Chemi", ru: "Chemi",
};
export function chemiTabLabel(locale: AppLocale) { return tabLabels[locale]; }
