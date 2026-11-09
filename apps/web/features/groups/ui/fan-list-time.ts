import type { AppLocale } from "@/i18n/locales";
import { localScheduleTime } from "@/features/schedules/domain/schedule-time";

/** DESIGN feed date format, using the shared absolute-time conversion in Seoul. */
export function fanListTime(value: string, locale: AppLocale, now = Date.now()): string {
  if (!Number.isFinite(Date.parse(value)) || !Number.isFinite(now)) return "";
  const at = localScheduleTime(value, "Asia/Seoul");
  const currentYear = localScheduleTime(new Date(now).toISOString(), "Asia/Seoul").slice(0, 4);
  const year = at.slice(0, 4);
  const date = new Intl.DateTimeFormat(locale, {
    calendar: "gregory", numberingSystem: "latn", timeZone: "Asia/Seoul",
    ...(year === currentYear ? {} : { year: "numeric" as const }), month: "2-digit", day: "2-digit",
  }).format(new Date(value));
  return `${date} ${at.slice(11, 16)}`;
}
