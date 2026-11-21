import { expect, it } from "vitest";
import { APP_LOCALES } from "@/i18n/locales";
import { fill, getRunCopy } from "./copy";

it("has every label in every language and keeps the placeholders of the Korean text", () => {
  const ko = getRunCopy("ko");
  for (const locale of APP_LOCALES) {
    const copy = getRunCopy(locale);
    for (const [key, text] of Object.entries(ko)) {
      const value = copy[key as keyof typeof ko];
      expect(value, `${locale}.${key}`).toBeTruthy();
      expect((value.match(/\{\w+\}/g) ?? []).sort(), `${locale}.${key}`).toEqual((text.match(/\{\w+\}/g) ?? []).sort());
    }
  }
  expect(fill(ko.start, { name: ko.changha, n: 2 })).toBe("창하로 시작 · 남은 판 2");
});
