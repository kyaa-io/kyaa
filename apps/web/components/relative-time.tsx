"use client";
import {useEffect, useState} from "react";
import type {AppLocale} from "@/i18n/locales";
import {exactTimeLabel, formatRelativeTime} from "@/i18n/relative-time";

const defaultAbsolute = (value: string, locale: AppLocale, timeZone: string) => exactTimeLabel(value, locale, timeZone);

/** 서버와 첫 렌더는 같은 표기로 두고, 마운트 후 브라우저 시간대를 적용한다. */
export function RelativeTime({value, locale, className, absolute = defaultAbsolute, relative = true}: {value: string; locale: AppLocale; className?: string; absolute?: (value: string, locale: AppLocale, timeZone: string) => string; relative?: boolean}) {
  const [now, setNow] = useState<number | null>(null);
  const [timeZone, setTimeZone] = useState("Asia/Seoul");
  useEffect(() => { setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"); setNow(Date.now()); }, [value]);
  const exact = exactTimeLabel(value, locale, timeZone);
  const label = now === null || !relative ? null : formatRelativeTime(value, locale, now);
  return <time className={className} dateTime={value} title={exact || undefined}>{label ?? absolute(value, locale, timeZone)}</time>;
}

/** Official feed dates keep their absolute format while using the browser zone. */
export function AbsoluteTime({value, locale, format}: {value: string; locale: AppLocale; format: (value: string, locale: AppLocale, timeZone: string) => string}) {
  const [timeZone, setTimeZone] = useState("Asia/Seoul");
  useEffect(() => { setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"); }, []);
  return <time dateTime={value}>{format(value, locale, timeZone)}</time>;
}
