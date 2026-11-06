import { messages } from "@/i18n/catalogs/features__dukjil__ui__dukjil-copy";
import { messages as missionMessages } from "@/i18n/catalogs/features__dukjil__ui__dukjil-mission-source";
import { translate } from "@/i18n/messages";
import type { AppLocale } from "@/i18n/locales";
import { dukjilMissionSource } from "./dukjil-mission-source";
import { dukjilSource } from "./dukjil-source";

const allSource = { ...dukjilSource, ...dukjilMissionSource };
const allMessages = { ...messages, ...missionMessages };
export type DukjilCopyKey = keyof typeof allSource;

/** ko/en come from the source files, the other locales from the i18n catalogs; numbers are always passed in by the caller. */
export function dukjilText(locale: AppLocale, key: DukjilCopyKey, values: readonly unknown[] = []) {
  const source = allSource[key];
  return translate(locale, allMessages[key], locale === "ko" ? source.ko : source.en, values);
}
