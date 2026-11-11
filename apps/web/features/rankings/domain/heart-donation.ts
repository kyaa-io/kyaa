import type { Route } from "next";
import type { AppLocale } from "@/i18n/locales";

/** 찐팬 하트 후원 이벤트의 설정값(대표 2026-11-11): 함께하는 크리에이터, 후원 대상 이름, 후원처. 비어 있으면 화면이 기본 문구로 채운다. */
export type HeartDonationEvent = { creatorSlug: string; creatorName: string | null; cause: string | null; recipient: string | null };

export const defaultHeartDonationEvent: HeartDonationEvent = { creatorSlug: "elina", creatorName: null, cause: null, recipient: null };

/** 후원 이벤트 상세 화면. */
export const heartDonationHref = (locale: AppLocale) => `/events/heart-donation?locale=${locale}` as Route;

/** `엘리나와`·`지수와` 형태: 한국어는 받침 여부로 와/과를 고르고, 다른 언어는 이름 그대로 쓴다(번역문이 앞뒤 말을 맡는다). */
export function togetherWith(locale: AppLocale, name: string) {
  if (locale !== "ko") return name;
  const last = name.trim().slice(-1).charCodeAt(0);
  const hangul = last >= 0xac00 && last <= 0xd7a3;
  return `${name}${hangul && (last - 0xac00) % 28 !== 0 ? "과" : "와"}`;
}
