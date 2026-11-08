import { messages } from "@/i18n/catalogs/features__fan-profile__fan-profile-copy";
import { translate } from "@/i18n/messages";
import type { AppLocale } from "@/i18n/locales";
import { fanProfileSource } from "./fan-profile-source";

export type FanProfileCopyKey = keyof typeof fanProfileSource;

/** ko/en from fan-profile-source.ts, the other locales from the catalog. Numbers are formatted by the caller. */
export function fanProfileText(locale: AppLocale, key: FanProfileCopyKey, values: readonly unknown[] = []) {
  const source = fanProfileSource[key];
  return translate(locale, messages[key], locale === "ko" ? source.ko : source.en, values);
}
