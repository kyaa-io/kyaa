import type { AppLocale } from "@/i18n/locales";
import { giftCopy } from "@/i18n/catalogs/features__gifts__ui__gift-copy";

export type GiftTextKey = keyof (typeof giftCopy)["ko"];

/** Gift tab copy with `{0}` placeholders filled in order. */
export function giftText(locale: AppLocale, key: GiftTextKey, ...values: readonly (string | number)[]): string {
  return giftCopy[locale][key].replace(/\{(\d+)\}/g, (token, index: string) => {
    const value = values[Number(index)];
    return value === undefined ? token : String(value);
  });
}
