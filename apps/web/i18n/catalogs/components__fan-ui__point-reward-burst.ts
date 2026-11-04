import type { AppLocale } from "@/i18n/locales";

const earned = {
  ko: "포인트 {0}점을 받았어요",
  en: "You earned {0} points",
  ja: "{0}ポイントを獲得しました",
  "zh-Hans": "获得了 {0} 积分",
  "zh-Hant": "獲得了 {0} 點數",
  es: "Has ganado {0} puntos",
  id: "Anda mendapat {0} poin",
  vi: "Bạn nhận được {0} điểm",
  th: "คุณได้รับ {0} พอยต์",
  pt: "Você ganhou {0} pontos",
  fr: "Vous avez gagné {0} points",
  ru: "Начислено баллов: {0}",
} satisfies Record<AppLocale, string>;

export const pointRewardAnnouncement = (locale: AppLocale, points: number) =>
  earned[locale].replace("{0}", points.toLocaleString(locale));
