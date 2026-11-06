import { messages } from "@/i18n/catalogs/components__editor";
import type { AppLocale } from "@/i18n/locales";
import { translate } from "@/i18n/messages";
import { editorSource } from "./editor-source";

export type EditorCopyKey = keyof typeof editorSource;

export function editorText(locale: AppLocale, key: EditorCopyKey, values: readonly unknown[] = []) {
  const source = editorSource[key];
  return translate(locale, messages[key], locale === "ko" ? source.ko : source.en, values);
}
