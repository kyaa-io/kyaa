import { messages } from "@/i18n/catalogs/features__rankings__ui__rankings-copy";
import { translate } from "@/i18n/messages";
import type { AppLocale } from "@/i18n/locales";
import { rankingsSource } from "./rankings-source";

export type RankingsCopyKey = keyof typeof rankingsSource;

/** ko/en come from rankings-source.ts, the other locales from the i18n catalog; numbers are passed in by the caller. */
export function rankingsText(locale: AppLocale, key: RankingsCopyKey, values: readonly unknown[] = []) {
  const source = rankingsSource[key];
  return translate(locale, messages[key], locale === "ko" ? source.ko : source.en, values);
}
