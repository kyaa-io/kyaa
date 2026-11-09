import type { AppLocale } from "@/i18n/locales";
import { messages } from "@/i18n/catalogs/components__fan-shell__fan-header-status";

const source = {
  "headerStatusStatus": {
    "ko": "내 팬 활동",
    "en": "My fan activity"
  },
  "headerStatusChangeFavorite": {
    "ko": "최애 바꾸기",
    "en": "Change favorite"
  },
  "headerStatusTierGuide": {
    "ko": "등급 안내",
    "en": "Tier guide"
  },
  "headerStatusHearts": {
    "ko": "하트",
    "en": "Hearts"
  },
  "headerStatusFindFavorite": {
    "ko": "다른 최애 찾기",
    "en": "Find more favorites"
  }
} as const;

export function headerStatusCopy(locale: AppLocale) {
  const text = (key: keyof typeof source) => locale === "ko" || locale === "en" ? source[key][locale] : messages[key][locale];
  return { status: text("headerStatusStatus"), changeFavorite: text("headerStatusChangeFavorite"), tierGuide: text("headerStatusTierGuide"), hearts: text("headerStatusHearts"), findFavorite: text("headerStatusFindFavorite") };
}
