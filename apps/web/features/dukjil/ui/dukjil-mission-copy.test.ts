import { describe, expect, it } from "vitest";
import { messages } from "@/i18n/catalogs/features__dukjil__ui__dukjil-mission-source";
import { APP_LOCALES } from "@/i18n/locales";
import { dukjilMissionSource } from "./dukjil-mission-source";

describe("mission copy", () => {
  it("fills every added locale and keeps every placeholder", () => {
    const placeholders = (text: string) => (text.match(/\{\d+\}/g) ?? []).sort();
    const locales = APP_LOCALES.filter(locale => locale !== "ko" && locale !== "en");
    expect(Object.keys(messages).sort()).toEqual(Object.keys(dukjilMissionSource).sort());
    for (const [key, source] of Object.entries(dukjilMissionSource)) {
      expect(placeholders(source.ko), key).toEqual(placeholders(source.en));
      for (const locale of locales) {
        const text = (messages as Record<string, Record<string, string>>)[key][locale];
        expect(text?.trim(), `${key}/${locale}`).toBeTruthy();
        expect(placeholders(text), `${key}/${locale}`).toEqual(placeholders(source.en));
      }
    }
  });
});
