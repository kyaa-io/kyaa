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

const countMetricFormatter = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
/** 참여 수(팬·하트 합계·좋아요) 표기(5차 E-1 2): 10,000 미만은 전체 자릿수(`1,240`), 그 이상은 언어와 무관하게 `12K`·`1.2M`.
 * 내 자산(포인트·응모권·스탬프·하트)은 이 함수를 쓰지 않는다 — 늘 전체 자릿수. */
export function formatCountMetric(locale: AppLocale, value: number): string {
  if (!Number.isFinite(value)) return "";
  return Math.abs(value) < 10_000 ? value.toLocaleString(locale) : countMetricFormatter.format(value);
}
