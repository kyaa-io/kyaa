import type { AppLocale } from "@/i18n/locales";

const justNow = {
  ko: "방금 전",
  en: "just now",
  ja: "たった今",
  "zh-Hans": "刚刚",
  "zh-Hant": "剛剛",
  es: "ahora mismo",
  id: "baru saja",
  vi: "vừa xong",
  th: "เมื่อสักครู่",
  pt: "agora mesmo",
  fr: "à l’instant",
  ru: "только что",
} satisfies Record<AppLocale, string>;
export const justNowLabel = (locale: AppLocale) => justNow[locale];
