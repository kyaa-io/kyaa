"use client";
import { useEffect, useState } from "react";
import type { AppLocale } from "@/i18n/locales";
import { eventDayRemainingText } from "../domain/event-day";

/**
 * 오늘 자정(KST)까지 남은 시간 글자. 서버·브라우저 첫 그림이 같도록 마운트 뒤에 읽고(그전에는 null), 1분마다 바꾼다(초 단위로 바뀌는 글자는 두지 않는다).
 * `now`는 시험용 고정 시각이라 있으면 갱신하지 않는다.
 */
export function useEventDayRemaining(locale: AppLocale, now?: Date): string | null {
  const [current, setCurrent] = useState<number | null>(now ? now.getTime() : null);
  useEffect(() => {
    if (now) return;
    setCurrent(Date.now());
    const timer = window.setInterval(() => setCurrent(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [now]);
  return current === null ? null : eventDayRemainingText(locale, current);
}
