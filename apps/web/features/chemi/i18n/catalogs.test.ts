import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { APP_LOCALES } from "../../../i18n/locales";
import { koreanDateLineState } from "./korean-date";

function keys(value: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix + key;
    return typeof child === "object" && child !== null
      ? keys(child as Record<string, unknown>, path + ".") : [path];
  }).sort();
}
const load = (locale: string) => JSON.parse(readFileSync(resolve(__dirname, "locales", locale, "chemi.json"), "utf8"));
describe("chemi language scaffold", () => {
  for (const locale of APP_LOCALES) it(locale, () => {
    const catalog = load(locale);
    expect(keys(catalog)).toEqual(keys(load("ko")));
    expect(catalog.menu).toEqual({ home: "HOME", my: "MY" });
    for (const key of ["fortuneHours", "fortuneMinutes", "gameHours", "gameMinutes"]) {
      if (catalog.date[key]) expect(catalog.date[key]).toContain("{count}");
    }
  });
  it("detects a missing nested key", () => {
    const broken = load("en");
    delete broken.date.basis;
    expect(keys(broken)).not.toEqual(keys(load("ko")));
  });
  it("uses server KST midnight across the UTC date boundary", () => {
    const state = koreanDateLineState({ locale: "en", deviceTimeZone: "UTC", serverNow: "2026-11-18T14:30:00Z" });
    expect(state).toEqual({ visible: true, day: "2026-11-18", unit: "minutes", count: 30 });
    expect(koreanDateLineState({ locale: "ko", deviceTimeZone: "Asia/Seoul", serverNow: "2026-11-18T14:30:00Z", elapsedMs: 1800000 })).toEqual({ visible: false, day: "2026-11-19", unit: "hours", count: 24 });
  });
  it("shows the line for Korean outside Korea", () => {
    expect(koreanDateLineState({ locale: "ko", deviceTimeZone: "UTC", serverNow: "2026-11-18T08:00:00Z" }).visible).toBe(true);
  });
});
