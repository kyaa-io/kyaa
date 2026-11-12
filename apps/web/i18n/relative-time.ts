import type {AppLocale} from "./locales";
import {justNowLabel} from "./catalogs/common__relative-time";

/** 이 일수 이상 지난 시각은 상대 표기 대신 기존 절대 날짜 표기를 쓴다. */
export const RELATIVE_TIME_MAX_DAYS = 7;
/** 서버·브라우저 시계 차이로 생기는 약간의 미래 시각은 지금으로 본다. */
const FUTURE_TOLERANCE_MS = 60_000;
const SECOND = 1000, MINUTE = 60 * SECOND, HOUR = 60 * MINUTE, DAY = 24 * HOUR;

export const exactTimeLabel = (value: string | Date, locale: AppLocale, timeZone = "Asia/Seoul") => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {calendar: "gregory", dateStyle: "medium", timeStyle: "short", timeZone}).format(date);
};

/** 상대 표기를 쓸 수 없으면(7일 이상, 먼 미래, 잘못된 값) null을 돌려 호출부가 절대 날짜를 쓰게 한다. */
export function formatRelativeTime(value: string | Date, locale: AppLocale, now: number = Date.now()): string | null {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time) || !Number.isFinite(now)) return null;
  const elapsed = now - time;
  if (elapsed < -FUTURE_TOLERANCE_MS || elapsed >= RELATIVE_TIME_MAX_DAYS * DAY) return null;
  if (elapsed < MINUTE) return justNowLabel(locale);
  const rtf = new Intl.RelativeTimeFormat(locale, {numeric: "always", style: "long"});
  if (elapsed < HOUR) return rtf.format(-Math.floor(elapsed / MINUTE), "minute");
  if (elapsed < DAY) return rtf.format(-Math.floor(elapsed / HOUR), "hour");
  return rtf.format(-Math.floor(elapsed / DAY), "day");
}
