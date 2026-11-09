import type { AppLocale } from "@/i18n/locales";

const copy: Record<AppLocale, { jjinfans: string; order: string; since: string }> = {
  ko: { jjinfans: "찐팬", order: "하트 많은 순", since: "찐팬" },
  en: { jjinfans: "True fans", order: "Most hearts", since: "True fan" },
  ja: { jjinfans: "熱烈ファン", order: "ハートが多い順", since: "熱烈ファン" },
  "zh-Hans": { jjinfans: "真爱粉", order: "爱心从多到少", since: "真爱粉" },
  "zh-Hant": { jjinfans: "真愛粉", order: "愛心由多至少", since: "真愛粉" },
  es: { jjinfans: "Fans fieles", order: "Más corazones", since: "Fan fiel" },
  id: { jjinfans: "Penggemar sejati", order: "Hati terbanyak", since: "Penggemar sejati" },
  vi: { jjinfans: "Fan chân chính", order: "Nhiều tim nhất", since: "Fan chân chính" },
  th: { jjinfans: "แฟนตัวจริง", order: "หัวใจมากที่สุด", since: "แฟนตัวจริง" },
  pt: { jjinfans: "Fãs fiéis", order: "Mais corações", since: "Fã fiel" },
  fr: { jjinfans: "Fans fidèles", order: "Le plus de cœurs", since: "Fan fidèle" },
  ru: { jjinfans: "Преданные фанаты", order: "Больше сердец", since: "Преданный фанат" },
};
export const fanListCopy = (locale: AppLocale) => copy[locale];
