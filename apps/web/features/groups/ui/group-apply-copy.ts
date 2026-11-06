import { messages } from "@/i18n/catalogs/features__groups__ui__group-apply-copy";
import type { AppLocale } from "@/i18n/locales";
import { translate } from "@/i18n/messages";
import { groupApplySource } from "./group-apply-source";

export type GroupApplyCopyKey = keyof typeof groupApplySource;
export function groupApplyText(locale: AppLocale, key: GroupApplyCopyKey) {
  const source = groupApplySource[key];
  return translate(locale, messages[key], locale === "ko" ? source.ko : source.en, []);
}
