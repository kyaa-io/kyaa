import { messages } from "@/i18n/catalogs/features__groups__ui__manage-source";
import type { AppLocale } from "@/i18n/locales";
import { translate } from "@/i18n/messages";
import { manageSource } from "./manage-source";

export type ManageCopyKey = keyof typeof manageSource;

/** 운영 관리와 행사 만들기에 새로 쓰는 문구. */
export function manageText(locale: AppLocale, key: ManageCopyKey) {
  const source = manageSource[key];
  return translate(locale, messages[key], locale === "ko" ? source.ko : source.en, []);
}
