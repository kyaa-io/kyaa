import type { AppLocale } from "@/i18n/locales";
import { togetherWith, type HeartDonationEvent } from "../domain/heart-donation";
import { rankingsText } from "./rankings-copy";

/** `엘리나와 함께 찐팬 하트로 불우이웃 후원하기`: the name the page itself carries (`pageName`, in the viewer's language) wins over the setting, which wins over the default. */
export function heartDonationTitle(locale: AppLocale, event: HeartDonationEvent, pageName?: string) {
  const creator = pageName || event.creatorName || rankingsText(locale, "hdCreatorDefault");
  return rankingsText(locale, "hdTitle", [togetherWith(locale, creator), event.cause || rankingsText(locale, "hdCauseDefault")]);
}
