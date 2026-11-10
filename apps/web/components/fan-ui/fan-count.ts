import type { AppLocale } from "@/i18n/locales";

const formatters = new Map<string, Intl.NumberFormat>();
function compact(locale: string) {
  let formatter = formatters.get(locale);
  if (!formatter) formatters.set(locale, formatter = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }));
  return formatter;
}

/** Fan count for a creator. Returns null when there is nothing to show (0 or invalid), so callers hide the line (rubric A1). */
export function formatFanCount(value: number, locale: AppLocale = "en"): string | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  if (locale === "ko") return `팬 ${compact("ko-KR").format(value)}명`;
  return `${compact("en-US").format(value)} Fans`;
}
