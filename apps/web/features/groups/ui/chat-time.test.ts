import { describe, expect, it } from "vitest";
import { APP_LOCALES } from "@/i18n/locales";
import { chatTimes } from "./chat-time";

describe("chat times in the viewer's timezone", () => {
  it("starts a new group exactly sixty seconds later", () => {
    const items = ["2026-11-21T06:12:30Z", "2026-11-21T06:13:30Z"].map(createdAt => ({ createdAt, profileId: "fan" }));
    expect(chatTimes(items, "ko").every(row => row.label)).toBe(true);
  });

  it.each(APP_LOCALES)("groups adjacent sends across a clock minute but splits at local midnight and author changes (%s)", locale => {
    const times = [new Date(2026, 10, 20, 23, 59, 58), new Date(2026, 10, 21, 0, 0, 55), new Date(2026, 10, 21, 0, 1, 4), new Date(2026, 10, 21, 0, 1, 5)];
    const rows = chatTimes(times.map((date, i) => ({ createdAt: date.toISOString(), profileId: i === 3 ? "b" : "a" })), locale, new Date(2026, 10, 28));
    expect(rows.map(row => Boolean(row.heading))).toEqual([true, true, false, false]);
    expect(rows.map(row => Boolean(row.label))).toEqual([true, false, true, true]);
    expect(rows[0]?.label).toBe(new Intl.DateTimeFormat(locale, {dateStyle:"short", timeStyle:"short"}).format(times[0]));
    expect(rows[2]?.label).toBe(new Intl.DateTimeFormat(locale, {hour:"numeric", minute:"2-digit"}).format(times[2]));
  });
});
