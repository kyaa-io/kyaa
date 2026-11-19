import type ko from "@/features/chemi/i18n/locales/ko/chemi.json";

export type MyBirthCopy = (typeof ko)["myBirth"];

/** 비어 있는 번역(아직 번역 전)은 한국어 원문으로 채운다(i18n README: 빈 문자열 = 번역 대기). */
export function mergeMyBirthCopy(source: MyBirthCopy, localized: Partial<Record<keyof MyBirthCopy, string>>): MyBirthCopy {
  const merged: Record<string, string> = { ...source };
  for (const [key, text] of Object.entries(localized)) if (text) merged[key] = text;
  return merged as MyBirthCopy;
}

/** `{name}` 자리를 값으로 바꾼다. */
export function fillCopy(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
}
