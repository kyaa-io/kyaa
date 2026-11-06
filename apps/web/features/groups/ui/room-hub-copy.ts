import { messages } from "@/i18n/catalogs/features__groups__ui__room-hub-source";
import type { AppLocale } from "@/i18n/locales";
import { translate } from "@/i18n/messages";
import { roomHubSource } from "./room-hub-source";

export type RoomHubCopyKey = keyof typeof roomHubSource;

/** Labels of the private-room hub. Numbers are always passed in by the caller. */
export function roomHubText(locale: AppLocale, key: RoomHubCopyKey, values: readonly unknown[] = []) {
  const source = roomHubSource[key];
  return translate(locale, messages[key], locale === "ko" ? source.ko : source.en, values);
}
