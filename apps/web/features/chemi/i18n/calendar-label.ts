/** Format a calendar day independently of the browser's Mongolian ICU data. */
export function calendarLabel(locale: string, day: string, options: Intl.DateTimeFormatOptions) {
  const date = new Date(day + "T00:00:00Z");
  if (locale === "mn") {
    const weekdays = ["Ням", "Даваа", "Мягмар", "Лхагва", "Пүрэв", "Баасан", "Бямба"];
    return [
      options.month && `${date.getUTCMonth() + 1}-р сарын ${date.getUTCDate()}`,
      options.weekday && weekdays[date.getUTCDay()],
    ].filter(Boolean).join(", ");
  }
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(date);
}

export function runDateLabel(locale: string, now: Date) {
  const day = new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10);
  return calendarLabel(locale, day, { month: "long", day: "numeric" });
}
