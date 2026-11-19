"use client";
import { FanTag } from "@/components/fan-ui/fan-tag";
import { FanText } from "@/components/fan-ui/fan-text";
import type { AppLocale } from "@/i18n/locales";
import { eventDayLabel } from "../domain/event-day";
import { useEventDayRemaining } from "./use-event-day-remaining";
import styles from "./event-day-eyebrow.module.css";

/** 관리자 '이벤트' 배너의 머리말: `오늘 하루 이벤트` 태그 + 오늘 자정까지 남은 시간. `now`는 시험용이다. */
export function EventDayEyebrow({ locale, now }: { locale: AppLocale; now?: Date }) {
  const remaining = useEventDayRemaining(locale, now);
  return <span className={styles.eyebrow} data-event-day-eyebrow="">
    <FanTag tone="notice">{eventDayLabel(locale)}</FanTag>
    {remaining === null ? null : <FanText role="meta" className={styles.remaining}>{remaining}</FanText>}
  </span>;
}
