import type { AppLocale } from "@/i18n/locales";

/** Creator selection approved 2026-11-12; slugs verified against the dev public catalog. */
export const JJINFAN_BANNER_CREATORS = [
  { slug: "yuna", ko: "유나", en: "Yuna" },
  { slug: "hiroro", ko: "히로로", en: "Hiroro" },
  { slug: "mmnoo-s", ko: "김민주", en: "Kim Minju" },
] as const;
export const jjinfanBannerHref = (slug: string, locale: AppLocale) => `/${encodeURIComponent(slug)}?locale=${locale}&challenge=jjinfan100`;
