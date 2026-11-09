import { describe, expect, it } from "vitest";
import { APP_LOCALES } from "@/i18n/locales";
import { fanListTime } from "./fan-list-time";
import { fanListCopy } from "./fan-list-copy";
const now = Date.parse("2026-11-10T12:00:00Z");
describe("fan list title time", () => {
  it("uses the feed date format and omits this year's year", () => {
    expect(fanListTime("2026-11-08T04:47:59Z", "ko", now)).toBe("11. 08. 13:47");
    expect(fanListTime("2026-11-10T11:59:00Z", "ko", now)).toBe("11. 10. 20:59");
    expect(fanListTime("2026-10-01T23:00:00Z", "ko", now)).toBe("10. 02. 08:00");
  });
  it("includes the year for dates outside the current Seoul year", () => {
    expect(fanListTime("2025-11-08T04:47:00Z", "ko", now)).toBe("2025. 11. 08. 13:47");
    expect(fanListTime("2027-11-08T04:47:00Z", "ko", now)).toBe("2027. 11. 08. 13:47");
    const newYear = Date.parse("2026-12-31T15:00:00Z");
    expect(fanListTime("2026-12-31T15:00:00Z", "ko", newYear)).toBe("01. 01. 00:00");
    expect(fanListTime("2026-12-31T14:59:00Z", "ko", newYear)).toBe("2026. 12. 31. 23:59");
  });
  it("does not render invalid dates", () => {
    expect(fanListTime("invalid", "ko", now)).toBe("");
    expect(fanListTime("2026-11-08T04:47:00Z", "ko", NaN)).toBe("");
  });
  it.each(APP_LOCALES)("keeps a short localized label and locale date separators in %s", locale => {
    expect(Object.values(fanListCopy(locale))).toHaveLength(3);
    expect(fanListCopy(locale).since).not.toContain("{0}");
    const dates = { ko: "11. 08.", en: "11/08", ja: "11/08", "zh-Hans": "11/08", "zh-Hant": "11/08", es: "8/11", id: "08/11", vi: "08-11", th: "08/11", pt: "08/11", fr: "08/11", ru: "08.11" };
    expect(fanListTime("2026-11-08T04:47:00Z", locale, now)).toBe(`${dates[locale]} 13:47`);
  });
});
