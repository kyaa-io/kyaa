import type { AppLocale } from "@/i18n/locales";

type Message = { createdAt: string; profileId: string };

function calendarDay(date: Date) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000;
}

export function chatTimes(items: Message[], locale: AppLocale, now = new Date()) {
  const clock = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" });
  const dated = new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" });
  const heading = new Intl.DateTimeFormat(locale, { month: "long", day: "numeric", weekday: "long" });
  const dates = items.map(item => new Date(item.createdAt));
  const today = calendarDay(now);
  return dates.map((date, index) => {
    if (!Number.isFinite(date.getTime())) return { heading: null, label: null };
    const day = calendarDay(date);
    const previous = dates[index - 1], next = dates[index + 1];
    const gap = next ? next.getTime() - date.getTime() : Infinity;
    const continues = next && items[index]?.profileId === items[index + 1]?.profileId
      && calendarDay(next) === day && gap >= 0 && gap < 60_000;
    return {
      heading: !previous || calendarDay(previous) !== day ? heading.format(date) : null,
      label: continues ? null : (today - day > 7 ? dated : clock).format(date),
    };
  });
}
