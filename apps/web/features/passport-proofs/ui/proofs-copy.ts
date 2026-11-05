import { messages } from "@/i18n/catalogs/features__passport-proofs__ui__proofs-copy";
import { translate } from "@/i18n/messages";
import type { AppLocale } from "@/i18n/locales";
import { proofsSource } from "./proofs-source";

export type ProofsCopyKey = keyof typeof proofsSource;

/** ko/en come from proofs-source.ts, the other locales from the i18n catalog. */
export function proofsText(locale: AppLocale, key: ProofsCopyKey, values: readonly unknown[] = []) {
  const source = proofsSource[key];
  return translate(locale, messages[key], locale === "ko" ? source.ko : source.en, values);
}
