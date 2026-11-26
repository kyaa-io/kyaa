import { describe, expect, it } from "vitest";
import { APP_LOCALES } from "@/i18n/locales";
import { copy } from "./copy";

describe("chemi guide labels in every language", () => {
  const english = copy.en;
  for (const locale of APP_LOCALES.filter((value) => value !== "ko")) {
    it(locale, () => {
      const rows = Object.entries(copy[locale]);
      expect(rows.length).toBe(4);
      expect(rows.filter(([, text]) => text.trim() === "" || /[가-힣]/.test(text)).map(([key]) => key)).toEqual([]);
      if (locale !== "en") expect(rows.filter(([key, text]) => text === english[key as keyof typeof english]).map(([key]) => key), "same as English").toEqual([]);
    });
  }
});
