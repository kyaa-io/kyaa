import { describe, expect, it } from "vitest";
import { APP_LOCALES } from "@/i18n/locales";
import { fanListTime } from "./fan-list-time";
import { fanListCopy } from "./fan-list-copy";
const now = Date.parse("2026-11-09T12:00:00Z"), hour = 3_600_000;
describe("fan list title time", () => {
  it("uses hours before 24h, days before 7d, then Korean-time M. D.", () => {
    expect(fanListTime(new Date(now - 0.5 * hour).toISOString(), "ko", now)).toBe("0시간 전");
    expect(fanListTime(new Date(now - 23 * hour).toISOString(), "ko", now)).toBe("23시간 전");
    expect(fanListTime(new Date(now - 24 * hour).toISOString(), "ko", now)).toBe("1일 전");
    expect(fanListTime(new Date(now - 6 * 24 * hour).toISOString(), "ko", now)).toBe("6일 전");
    expect(fanListTime(new Date(now - 7 * 24 * hour).toISOString(), "ko", now)).toBe("11. 2.");
    expect(fanListTime("2026-10-01T23:00:00Z", "ko", now)).toBe("10. 2.");
  });
  it.each(APP_LOCALES)("supplies all new labels and relative time in %s", locale => {
    expect(Object.values(fanListCopy(locale))).toHaveLength(3);
    expect(fanListCopy(locale).since).toContain("{0}");
    expect(fanListTime(new Date(now - 2 * hour).toISOString(), locale, now)).toContain("2");
  });
});
