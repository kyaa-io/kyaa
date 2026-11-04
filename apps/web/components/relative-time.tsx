"use client";
import {useEffect, useState} from "react";
import type {AppLocale} from "@/i18n/locales";
import {exactTimeLabel, formatRelativeTime} from "@/i18n/relative-time";

const defaultAbsolute = (value: string, locale: AppLocale) => exactTimeLabel(value, locale);

/** 서버 렌더와 첫 렌더는 절대 표기로 고정하고, 브라우저에 붙은 뒤에만 상대 표기로 바꿔 하이드레이션 불일치를 막는다. */
export function RelativeTime({value, locale, className, absolute = defaultAbsolute}: {value: string; locale: AppLocale; className?: string; absolute?: (value: string, locale: AppLocale) => string}) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); }, [value]);
  const exact = exactTimeLabel(value, locale);
  const label = now === null ? null : formatRelativeTime(value, locale, now);
  return <time className={className} dateTime={value} title={exact || undefined}>{label ?? absolute(value, locale)}</time>;
}
