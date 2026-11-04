import {describe, expect, it} from "vitest";
import {APP_LOCALES} from "./locales";
import {RELATIVE_TIME_MAX_DAYS, exactTimeLabel, formatRelativeTime} from "./relative-time";

const now = Date.parse("2026-11-04T03:00:00Z");
const ago = (ms: number) => new Date(now - ms).toISOString();
const S = 1000, M = 60 * S, H = 60 * M, D = 24 * H;

describe("formatRelativeTime", () => {
  it("covers the boundaries in ko", () => {
    expect(formatRelativeTime(ago(59 * S), "ko", now)).toBe("방금 전");
    expect(formatRelativeTime(ago(60 * S), "ko", now)).toBe("1분 전");
    expect(formatRelativeTime(ago(59 * M), "ko", now)).toBe("59분 전");
    expect(formatRelativeTime(ago(60 * M), "ko", now)).toBe("1시간 전");
    expect(formatRelativeTime(ago(23 * H), "ko", now)).toBe("23시간 전");
    expect(formatRelativeTime(ago(24 * H), "ko", now)).toBe("1일 전");
    expect(formatRelativeTime(ago(6 * D), "ko", now)).toBe("6일 전");
  });
  it("falls back to the absolute date at the cutoff", () => {
    expect(RELATIVE_TIME_MAX_DAYS).toBe(7);
    expect(formatRelativeTime(ago(7 * D - 1), "ko", now)).toBe("6일 전");
    expect(formatRelativeTime(ago(7 * D), "ko", now)).toBeNull();
    expect(formatRelativeTime(ago(30 * D), "en", now)).toBeNull();
  });
  it("treats small clock skew as now and far future as absolute", () => {
    expect(formatRelativeTime(new Date(now + 30 * S).toISOString(), "en", now)).toBe("just now");
    expect(formatRelativeTime(new Date(now + 5 * M).toISOString(), "en", now)).toBeNull();
  });
  it("rejects invalid values", () => {
    expect(formatRelativeTime("not-a-date", "ko", now)).toBeNull();
    expect(formatRelativeTime("", "en", now)).toBeNull();
    expect(formatRelativeTime(ago(M), "en", Number.NaN)).toBeNull();
    expect(exactTimeLabel("not-a-date", "ko")).toBe("");
  });
  it("uses the standard formatter in every app locale", () => {
    for (const locale of APP_LOCALES) {
      const expected = new Intl.RelativeTimeFormat(locale, {numeric: "always", style: "long"}).format(-3, "hour");
      expect(formatRelativeTime(ago(3 * H), locale, now)).toBe(expected);
    }
    expect(formatRelativeTime(ago(5 * M), "en", now)).toBe("5 minutes ago");
    expect(formatRelativeTime(ago(2 * D), "ja", now)).toBe("2 日前");
  });
  it("shows the catalog just-now wording in every app locale", () => {
    const expected = {ko: "방금 전", en: "just now", ja: "たった今", "zh-Hans": "刚刚", "zh-Hant": "剛剛", es: "ahora mismo", id: "baru saja", vi: "vừa xong", th: "เมื่อสักครู่", pt: "agora mesmo", fr: "à l’instant", ru: "только что"};
    for (const locale of APP_LOCALES) expect(formatRelativeTime(ago(10 * S), locale, now)).toBe(expected[locale]);
  });
  it("gives the exact Seoul time", () => {
    expect(exactTimeLabel("2026-11-04T03:00:00Z", "en")).toContain("12:00");
  });
});
