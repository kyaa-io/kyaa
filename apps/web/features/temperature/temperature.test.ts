import { describe, expect, it } from "vitest";
import { fanTemperature, temperatureParts } from "./temperature";

const catalog = { version: 3, missionBook: null, rules: {
  checkin: { points: 2 }, post: { points: 20, dailyLimit: 3 }, share: { points: 10, dailyLimit: 3 }, comment: { points: 3, dailyLimit: 10 },
  reaction: { points: 1, dailyLimit: 5 }, invite: { points: 200, dailyLimit: null }, proof: { points: 100 },
} } as never;
const act = (count: number, remaining: number | null) => ({ count, points: 0, remaining, stamped: false });
const today = (actions: Record<string, ReturnType<typeof act>>, attendedToday = false) => ({
  kstDate: "2026-11-07", policyActive: true as const, totalPoints: 0, actions, attendance: { attendedToday, streak: 1, nextBonusIn: 3 }, hasPassport: true,
});

describe("fan temperature", () => {
  it("counts check-in and limited activities only, and rounds to a whole number", () => {
    const t = today({ post: act(3, 0), share: act(1, 2), comment: act(10, 0), reaction: act(0, 5), invite: act(4, null), proof: act(1, null) }, true);
    expect(temperatureParts(catalog, t)).toEqual({ done: 3, total: 5, value: 60 });
  });
  it("is 0 with nothing done and 100 with everything done", () => {
    expect(fanTemperature(catalog, today({ post: act(0, 3), share: act(0, 3), comment: act(0, 10), reaction: act(0, 5) }))).toBe(0);
    expect(fanTemperature(catalog, today({ post: act(3, 0), share: act(3, 0), comment: act(10, 0), reaction: act(5, 0) }, true))).toBe(100);
  });
  it("takes a check-in made on this screen before the next read", () => {
    expect(fanTemperature(catalog, today({ post: act(0, 3), share: act(0, 3), comment: act(0, 10), reaction: act(0, 5) }), true)).toBe(20);
  });
  it("has no value without a policy, a read or a daily mission", () => {
    expect(fanTemperature(undefined, undefined)).toBeNull();
    expect(fanTemperature(catalog, { kstDate: "2026-11-07", policyActive: false } as never)).toBeNull();
    expect(fanTemperature({ version: 3, missionBook: null, rules: { invite: { points: 200 } } } as never, today({}))).toBeNull();
  });
});
