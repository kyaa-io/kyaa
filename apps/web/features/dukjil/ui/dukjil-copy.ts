import { messages } from "@/i18n/catalogs/features__dukjil__ui__dukjil-copy";
import { translate } from "@/i18n/messages";
import type { AppLocale } from "@/i18n/locales";
import { dukjilSource } from "./dukjil-source";

export type DukjilCopyKey = keyof typeof dukjilSource;

/** ko/en come from dukjil-source.ts, the other locales from the i18n catalog; numbers are always passed in by the caller. */
export function dukjilText(locale: AppLocale, key: DukjilCopyKey, values: readonly unknown[] = []) {
  const source = dukjilSource[key];
  return translate(locale, messages[key], locale === "ko" ? source.ko : source.en, values);
}
