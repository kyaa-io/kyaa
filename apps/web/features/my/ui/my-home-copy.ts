import { messages } from "@/i18n/catalogs/features__my__ui__my-home-copy";
import { translate } from "@/i18n/messages";
import type { AppLocale } from "@/i18n/locales";
import { myHomeSource } from "./my-home-source";

export type MyHomeCopyKey = keyof typeof myHomeSource;

/** ko/en come from my-home-source.ts, the other locales from the i18n catalog; numbers and names are passed in by the caller. */
export function myHomeText(locale: AppLocale, key: MyHomeCopyKey, values: readonly unknown[] = []) {
  const source = myHomeSource[key];
  return translate(locale, messages[key], locale === "ko" ? source.ko : source.en, values);
}
