import { messages } from "@/i18n/catalogs/components__fan-ui__fan-ui-copy";
import type { AppLocale } from "@/i18n/locales";
import { translate } from "@/i18n/messages";
import { fanUiSource } from "./fan-ui-source";

export type FanUiCopyKey = keyof typeof fanUiSource;

/** Labels of the shared fan-ui components. Numbers are always passed in by the caller. */
export function fanUiText(locale: AppLocale, key: FanUiCopyKey, values: readonly unknown[] = []) {
  const source = fanUiSource[key];
  return translate(locale, messages[key], locale === "ko" ? source.ko : source.en, values);
}
