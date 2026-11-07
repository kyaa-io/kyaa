import { messages } from "@/i18n/catalogs/features__groups__ui__manage-form-source";
import type { AppLocale } from "@/i18n/locales";
import { translate } from "@/i18n/messages";
import { manageFormSource } from "./manage-form-source";

/** 운영 관리의 미션·추첨 폼과 빈 상태 문구. */
export function manageFormText(locale: AppLocale, key: keyof typeof manageFormSource, values: readonly unknown[] = []) {
  const source = manageFormSource[key];
  return translate(locale, messages[key], locale === "ko" ? source.ko : source.en, values);
}
