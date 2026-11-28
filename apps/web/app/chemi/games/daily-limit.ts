import { parseAppLocale, type AppLocale } from "@/i18n/locales";

const labels: Record<AppLocale, string> = {
  ko: "하루 무료 3판",
  en: "3 free plays per day",
  ja: "1日3回無料",
  "zh-Hans": "每天免费 3 次",
  "zh-Hant": "每天免費 3 次",
  es: "3 partidas gratis al día",
  fr: "3 parties gratuites par jour",
  id: "3 permainan gratis per hari",
  mn: "Өдөрт 3 удаа үнэгүй",
  pt: "3 partidas grátis por dia",
  ru: "3 бесплатные игры в день",
  th: "เล่นฟรีวันละ 3 รอบ",
  vi: "3 lượt chơi miễn phí mỗi ngày",
};

export function dailyGameLimit(locale: string) {
  return labels[parseAppLocale(locale)];
}
