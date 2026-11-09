import type { AppLocale } from "@/i18n/locales";
import { formatRelativeTime } from "@/i18n/relative-time";

/** This list uses hours (including 0), days, then M. D.; exact time is available on the time element. */
export function fanListTime(value: string, locale: AppLocale, now = Date.now()): string {
  const date = new Date(value), elapsed = now - date.getTime();
  if (!Number.isFinite(date.getTime())) return "";
  if (elapsed >= -60_000 && elapsed < 3_600_000) return new Intl.RelativeTimeFormat(locale, { numeric: "always" }).format(-0, "hour");
  const relative = formatRelativeTime(value, locale, now);
  if (relative !== null) return relative;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" }).formatToParts(date);
  return `${parts.find(p => p.type === "month")!.value}. ${parts.find(p => p.type === "day")!.value}.`;
}
