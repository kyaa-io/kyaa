import { expect, it } from "vitest";
import { APP_LOCALES } from "@/i18n/locales";
import { growthStep } from "./ladder";

const boundaries = [0, 20, 60, 130, 250, 400, 650, 1000, 1400, 1800, 2250, 3000, 4000,
  5000, 6200, 7500, 9000, 10600, 12300, 14100, 16000, 18000, 20000, 22000, 24000, 26000];

it.each(APP_LOCALES)("resolves each threshold and the next star in %s", locale => {
  for (const [i, threshold] of boundaries.entries()) {
    const current = growthStep(threshold, locale);
    expect(current.number).toBe(Math.min(i + 1, 24));
    expect(current.chip).toBeTruthy();
    if (i > 0) {
      const previous = growthStep(threshold - 1, locale);
      expect(previous.remaining).toBe(1);
      expect(previous.nextName).toBe(current.name);
    }
  }
  expect(growthStep(22000 + 2000 * 713, locale).chip).toContain("★713");
});
