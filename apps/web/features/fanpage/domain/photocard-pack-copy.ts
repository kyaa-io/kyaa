import type { AppLocale } from "@/i18n/locales";

const open: Record<AppLocale, string> = {
  ko: "포토카드 열기",
  en: "Open photocard",
  ja: "フォトカードを開く",
  "zh-Hans": "打开小卡",
  "zh-Hant": "打開小卡",
  es: "Abrir photocard",
  id: "Buka photocard",
  vi: "Mở photocard",
  th: "เปิดโฟโต้การ์ด",
  pt: "Abrir photocard",
  fr: "Ouvrir la photocard",
  ru: "Открыть фотокарточку",
};

export function photocardPackCopy(locale: AppLocale) {
  return { open: open[locale] };
}
