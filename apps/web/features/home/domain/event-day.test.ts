import { describe, expect, it } from "vitest";
import { eventDayLabel, eventDayRemainingText, minutesUntilEventDayEnd, minutesUntilKstMidnight } from "./event-day";
import { APP_LOCALES } from "@/i18n/locales";

describe("event day countdown", () => {
  it("counts minutes to the next 00:00 KST, rounding up", () => {
    expect(minutesUntilKstMidnight(new Date("2026-11-19T13:24:00+09:00"))).toBe(10 * 60 + 36);
    expect(minutesUntilKstMidnight(new Date("2026-11-19T23:59:30+09:00"))).toBe(1);
    expect(minutesUntilKstMidnight(new Date("2026-11-20T00:00:00+09:00"))).toBe(24 * 60);
  });

  it("writes hours and minutes, minutes only under an hour, hours only on the hour", () => {
    expect(eventDayRemainingText("ko", new Date("2026-11-19T13:24:00+09:00"))).toBe("17시간 36분 남음");
    expect(eventDayRemainingText("ko", new Date("2026-11-20T06:24:00+09:00"))).toBe("36분 남음");
    expect(eventDayRemainingText("ko", new Date("2026-11-19T14:00:00+09:00"))).toBe("17시간 남음");
    expect(eventDayRemainingText("en", new Date("2026-11-19T13:24:00+09:00"))).toBe("17h 36m left");
  });

  it("has a label and a remaining-time text for every locale", () => {
    for (const locale of APP_LOCALES) {
      expect(eventDayLabel(locale)).not.toBe("");
      expect(eventDayRemainingText(locale, new Date("2026-11-19T13:24:00+09:00"))).toMatch(/\d/);
    }
  });
});

describe("minutesUntilEventDayEnd", () => {
  it("counts to the next 07:00 KST", () => {
    expect(minutesUntilEventDayEnd(new Date("2026-11-19T19:40:00+09:00"))).toBe(11 * 60 + 20);
    expect(minutesUntilEventDayEnd(new Date("2026-11-20T00:30:00+09:00"))).toBe(6 * 60 + 30);
    expect(minutesUntilEventDayEnd(new Date("2026-11-20T06:59:30+09:00"))).toBe(1);
    expect(minutesUntilEventDayEnd(new Date("2026-11-20T07:00:00+09:00"))).toBe(24 * 60);
  });
});
