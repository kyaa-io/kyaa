import { describe, expect, it } from "vitest";
import { luckyMileageCost, luckyMileageDailyLimit, luckyMileageEnabled } from "./lucky-mileage";

describe("mileage draw policy", () => {
  it("prices only single draws and complete batches", () => {
    expect([1, 10].map(luckyMileageCost)).toEqual([10, 100]);
    for (const count of [0, 2, 9, 11]) expect(() => luckyMileageCost(count)).toThrow();
  });
  it("uses the highest favorite regardless of order", () => {
    expect(luckyMileageDailyLimit([])).toBe(100);
    expect(luckyMileageDailyLimit(["Diamond", "Bronze"])).toBe(300);
    expect(luckyMileageDailyLimit(["Silver", "Gold", "Platinum"])).toBe(200);
  });
  it("requires development and explicit legal approval for paid mileage", () => {
    const env = { BYUS_DATA_ENVIRONMENT: "development", LUCKY_MILEAGE_ENABLED: "true" };
    expect(luckyMileageEnabled(env, "free")).toBe(true);
    expect(luckyMileageEnabled(env, "paid")).toBe(false);
    expect(luckyMileageEnabled({ ...env, BYUS_DATA_ENVIRONMENT: "production", LUCKY_PAID_MILEAGE_APPROVED: "true" }, "paid")).toBe(false);
  });
});
