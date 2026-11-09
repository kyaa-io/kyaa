import type { AppLocale } from "@/i18n/locales";

const copy: Record<AppLocale, { jjinfans: string; order: string; since: string }> = {
  ko: { jjinfans: "찐팬", order: "하트 많은 순", since: "찐팬 된 시각 {0}" },
  en: { jjinfans: "True fans", order: "Most hearts", since: "Became a true fan {0}" },
  ja: { jjinfans: "熱烈ファン", order: "ハートが多い順", since: "熱烈ファンになった日時 {0}" },
  "zh-Hans": { jjinfans: "真爱粉", order: "爱心从多到少", since: "成为真爱粉的时间 {0}" },
  "zh-Hant": { jjinfans: "真愛粉", order: "愛心由多至少", since: "成為真愛粉的時間 {0}" },
  es: { jjinfans: "Fans fieles", order: "Más corazones", since: "Fan fiel desde {0}" },
  id: { jjinfans: "Penggemar sejati", order: "Hati terbanyak", since: "Menjadi penggemar sejati {0}" },
  vi: { jjinfans: "Fan chân chính", order: "Nhiều tim nhất", since: "Trở thành fan chân chính {0}" },
  th: { jjinfans: "แฟนตัวจริง", order: "หัวใจมากที่สุด", since: "เป็นแฟนตัวจริงเมื่อ {0}" },
  pt: { jjinfans: "Fãs fiéis", order: "Mais corações", since: "Fã fiel desde {0}" },
  fr: { jjinfans: "Fans fidèles", order: "Le plus de cœurs", since: "Fan fidèle depuis {0}" },
  ru: { jjinfans: "Преданные фанаты", order: "Больше сердец", since: "Преданный фанат с {0}" },
};
export const fanListCopy = (locale: AppLocale) => copy[locale];
