import { describe, expect, it } from "vitest";
import { APP_LOCALES } from "@/i18n/locales";
import { operatorCopy, operatorCopyLabels, operatorCopyLength } from "./group-operator-copy";
describe("operator copy", () => {
  it("fills every key for all 12 locales", () => {
    expect(APP_LOCALES).toHaveLength(12);
    for (const locale of APP_LOCALES) {
      expect(operatorCopyLabels[locale]).toHaveLength(operatorCopyLength);
      for (const value of Object.values(operatorCopy(locale))) expect(value.trim()).not.toBe("");
    }
  });
});
