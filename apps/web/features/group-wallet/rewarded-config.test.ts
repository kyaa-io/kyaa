import { describe, expect, it } from "vitest";
import { rewardedExchangeDecision, REWARDED_SESSION_ENV } from "./rewarded-config";
// Test-only values.
const full = { KYAA_REWARDED_TICKET_EXCHANGE_ENABLED: "true", KYAA_REWARDED_AD_UNIT: "/1/test_unit", KYAA_REWARDED_AD_SESSION_TTL_SECONDS: "11", KYAA_REWARDED_AD_MIN_WATCH_SECONDS: "3", KYAA_REWARDED_AD_ISSUE_LIMIT: "5", KYAA_REWARDED_AD_ISSUE_WINDOW_SECONDS: "13", KYAA_REWARDED_AD_DAILY_CAP: "7" };
describe("rewarded exchange decision", () => {
  it("opens only with the flag, the unit and every session value", () => {
    expect(rewardedExchangeDecision(full)).toEqual({ enabled: true, adUnit: "/1/test_unit", session: { ttlSeconds: 11, minWatchSeconds: 3, issueLimit: 5, issueWindowSeconds: 13, dailyCap: 7 } });
  });
  it("stays closed when the flag is not exactly true, even with a unit and limits", () => {
    for (const flag of [undefined, "false", "1", "TRUE"]) expect(rewardedExchangeDecision({ ...full, KYAA_REWARDED_TICKET_EXCHANGE_ENABLED: flag })).toEqual({ enabled: false, reason: "gate_closed" });
  });
  it("stays closed without a valid unit", () => {
    for (const unit of [undefined, "", "not-a-path"]) expect(rewardedExchangeDecision({ ...full, KYAA_REWARDED_AD_UNIT: unit })).toEqual({ enabled: false, reason: "config_missing" });
  });
  it("has no defaults: any missing or non-positive session value closes it", () => {
    for (const name of Object.values(REWARDED_SESSION_ENV)) for (const value of [undefined, "", "0", "-1", "1.5", "abc"]) expect(rewardedExchangeDecision({ ...full, [name]: value })).toEqual({ enabled: false, reason: "config_missing" });
  });
});
