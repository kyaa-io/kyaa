import type { AppLocale } from "@/i18n/locales";
import { togetherWith, type HeartDonationEvent } from "../domain/heart-donation";
import { rankingsText } from "./rankings-copy";
import { creatorName, creatorNameSlugs } from "@/features/fanpage/domain/creator-names";

/** `엘리나와 함께 찐팬 하트로 불우이웃 후원하기`: the name the page itself carries (`pageName`, in the viewer's language) wins over the setting, which wins over the default. */
export function heartDonationTitle(locale: AppLocale, event: HeartDonationEvent, pageName?: string) {
  const creator = pageName || heartDonationCreator(locale, event);
  return rankingsText(locale, "hdTitle", [togetherWith(locale, creator), event.cause || rankingsText(locale, "hdCauseDefault")]);
}

/** 다른 언어 화면에서 표에 있는 크리에이터는 설정 이름(관리자가 한국어로 적는 칸) 대신 사이트 공통 표기(creatorName)를 쓴다. */
export function heartDonationCreator(locale: AppLocale, event: HeartDonationEvent): string {
  if (locale !== "ko" && creatorNameSlugs.includes(event.creatorSlug)) return creatorName(event.creatorSlug, locale);
  return event.creatorName || rankingsText(locale, "hdCreatorDefault");
}
