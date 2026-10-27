import Link from "next/link";
import type { Route } from "next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { AppLocale } from "@/i18n/locales";
import styles from "./events-pagination.module.css";

const labels = {
  ko: { navigation: "이벤트 페이지", previous: "이전", next: "다음" },
  en: { navigation: "Event pages", previous: "Previous", next: "Next" },
  ja: { navigation: "イベントのページ", previous: "前へ", next: "次へ" },
  "zh-Hans": { navigation: "活动分页", previous: "上一页", next: "下一页" },
  "zh-Hant": { navigation: "活動分頁", previous: "上一頁", next: "下一頁" },
  es: { navigation: "Páginas de eventos", previous: "Anterior", next: "Siguiente" },
  id: { navigation: "Halaman acara", previous: "Sebelumnya", next: "Berikutnya" },
  vi: { navigation: "Trang sự kiện", previous: "Trước", next: "Tiếp" },
  th: { navigation: "หน้ากิจกรรม", previous: "ก่อนหน้า", next: "ถัดไป" },
  pt: { navigation: "Páginas de eventos", previous: "Anterior", next: "Próxima" },
  fr: { navigation: "Pages des événements", previous: "Précédent", next: "Suivant" },
  ru: { navigation: "Страницы событий", previous: "Назад", next: "Далее" },
} satisfies Record<AppLocale, { navigation: string; previous: string; next: string }>;

export const EVENTS_PAGE_SIZE = 10;

export function EventsPagination({ locale, page, pageCount }: { locale: AppLocale; page: number; pageCount: number }) {
  if (pageCount <= 1) return null;
  const t = labels[locale];
  const href = (nextPage: number) => `/events?${new URLSearchParams({ locale, ...(nextPage > 1 ? { page: String(nextPage) } : {}) })}` as Route;
  const previous = <><ChevronLeft aria-hidden="true" />{t.previous}</>;
  const next = <>{t.next}<ChevronRight aria-hidden="true" /></>;
  return <nav className={styles.pagination} aria-label={t.navigation}>
    {page > 1 ? <Link href={href(page - 1)}>{previous}</Link> : <span className={styles.disabled} aria-disabled="true">{previous}</span>}
    <span className={styles.position} aria-current="page">{new Intl.NumberFormat(locale).format(page)} / {new Intl.NumberFormat(locale).format(pageCount)}</span>
    {page < pageCount ? <Link href={href(page + 1)}>{next}</Link> : <span className={styles.disabled} aria-disabled="true">{next}</span>}
  </nav>;
}
