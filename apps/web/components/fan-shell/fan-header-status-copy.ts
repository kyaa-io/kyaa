import type { AppLocale } from "@/i18n/locales";
import { messages } from "@/i18n/catalogs/components__fan-shell__fan-header-status";

const source = {
  "headerStatusStatus": {
    "ko": "내 팬 활동",
    "en": "My fan activity"
  },
  "headerStatusHearts": {
    "ko": "하트",
    "en": "Hearts"
  }
} as const;

export function headerStatusCopy(locale: AppLocale) {
  const text = (key: keyof typeof source) => locale === "ko" || locale === "en" ? source[key][locale] : messages[key][locale];
  return { status: text("headerStatusStatus"), hearts: text("headerStatusHearts") };
}
