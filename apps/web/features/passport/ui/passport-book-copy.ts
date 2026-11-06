import { messages } from "@/i18n/catalogs/features__passport__ui__passport-book-source";
import { translate } from "@/i18n/messages";
import type { AppLocale } from "@/i18n/locales";
import { passportBookSource } from "./passport-book-source";

export type PassportBookKey = keyof typeof passportBookSource;

export function passportBookText(locale: AppLocale, key: PassportBookKey, values: readonly unknown[] = []) {
  const source = passportBookSource[key];
  return translate(locale, messages[key], locale === "ko" ? source.ko : source.en, values);
}
