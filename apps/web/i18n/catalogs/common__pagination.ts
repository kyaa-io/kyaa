import type { AppLocale } from "@/i18n/locales";

const labels = {
  ko: { previous: "이전", next: "다음" },
  en: { previous: "Previous", next: "Next" },
  ja: { previous: "前へ", next: "次へ" },
  "zh-Hans": { previous: "上一页", next: "下一页" },
  "zh-Hant": { previous: "上一頁", next: "下一頁" },
  es: { previous: "Anterior", next: "Siguiente" },
  id: { previous: "Sebelumnya", next: "Berikutnya" },
  vi: { previous: "Trước", next: "Tiếp" },
  th: { previous: "ก่อนหน้า", next: "ถัดไป" },
  pt: { previous: "Anterior", next: "Próxima" },
  fr: { previous: "Précédent", next: "Suivant" },
  ru: { previous: "Назад", next: "Далее" },
} satisfies Record<AppLocale, { previous: string; next: string }>;
export const paginationCopy = (locale: AppLocale) => labels[locale];
