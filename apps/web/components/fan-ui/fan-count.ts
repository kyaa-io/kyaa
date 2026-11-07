import type { AppLocale } from "@/i18n/locales";
import { fanUiText } from "./fan-ui-copy";

const fanCountFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatFanCount(value: number): string {
  return `${fanCountFormatter.format(value)} Fans`;
}

/** 팬 수 표기. 모임 목록과 같은 문구(`팬 {0}`)를 쓰고, 큰 수만 언어별 축약 표기로 줄인다. */
export function formatLocalizedFanCount(locale: AppLocale, value: number): string {
  return fanUiText(locale, "fanCount", [new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(value)]);
}
