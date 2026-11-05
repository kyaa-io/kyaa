import { describe, expect, it } from "vitest";
import { catalogIsActive, checkinNumbers, parseDukjilAttendanceList, parseDukjilToday, streakCells, todayItem, todayStampCount } from "./dukjil-ui";

const activeToday = { kstDate: "2026-11-05", policyActive: true, totalPoints: 22, actions: { post: { count: 1, points: 20, remaining: 2, stamped: true } }, attendance: { attendedToday: true, streak: 3, nextBonusIn: 4 }, hasPassport: true };
const catalog = (rules: Record<string, unknown>) => ({ version: "v", rules, missionBook: {} }) as never;

describe("dukjil ui domain (contract §15)", () => {
  it("fills the 7-day card and marks the bonus day from nextBonusIn", () => {
    expect(streakCells(0, false, 7)).toEqual({ filled: 0, todayIndex: 0, bonusToday: false });
    expect(streakCells(6, false, 1)).toEqual({ filled: 6, todayIndex: 6, bonusToday: true });
    expect(streakCells(7, true, 7)).toEqual({ filled: 7, todayIndex: -1, bonusToday: false });
  });
  it("reads check-in numbers from rules.checkin only", () => {
    expect(checkinNumbers(undefined)).toEqual({ points: undefined, bonus: undefined, every: undefined });
    expect(checkinNumbers(catalog({ checkin: { points: 2, streakEvery: 7, streakBonus: 10, bonusPoints: 99 } }))).toEqual({ points: 2, bonus: 10, every: 7 });
    expect(checkinNumbers(catalog({ checkin: { points: 2, bonusPoints: 99 } })).bonus).toBeUndefined();
  });
  it("gates on a non-empty catalog", () => {
    expect(catalogIsActive(undefined)).toBe(false);
    expect(catalogIsActive(catalog({}))).toBe(false);
    expect(catalogIsActive(catalog({ checkin: { points: 2 } }))).toBe(true);
  });
  it("accepts only the §15 today shapes and rejects the rest", () => {
    expect(todayStampCount(parseDukjilToday(activeToday))).toBe(1);
    expect(todayItem(parseDukjilToday(activeToday), "post")?.remaining).toBe(2);
    expect(parseDukjilToday({ kstDate: "2026-11-05", policyActive: false }).policyActive).toBe(false);
    expect(() => parseDukjilToday({ date: "2026-11-05", items: [], totalPoints: 0 })).toThrow();
    expect(() => parseDukjilToday({ ...activeToday, attendance: { checkedIn: true, streak: 1 } })).toThrow();
  });
  it("parses the attendance list", () => {
    expect(parseDukjilAttendanceList({ kstDate: "2026-11-05", items: [{ celebrityId: "c", attendedToday: false, streak: 0, nextBonusIn: 7, hasPassport: false }] }).items).toHaveLength(1);
    expect(() => parseDukjilAttendanceList({ kstDate: "2026-11-05", items: [{ celebrityId: "c" }] })).toThrow();
  });
});
