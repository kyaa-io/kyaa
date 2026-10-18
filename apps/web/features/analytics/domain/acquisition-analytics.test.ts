import { describe, expect, it } from "vitest";
import { acquisitionAnalyticsSchema } from "./acquisition-analytics";
const metric = (value: number) => ({ state: "available", value, reason: null, source: "fan_product_events" });
const counts = { acquisitions: metric(10), accountCreated: metric(5), profileCompleted: metric(0), reservationCompleted: metric(0), benefitEntered: metric(5) };
const data = { days: 7, from: "2026-10-12T00:00:00Z", to: "2026-10-18T08:00:00Z", totals: counts, rows: [{ channel: "search", landing: "benefit", ...counts }] };
describe("acquisition aggregate privacy boundary", () => {
  it("accepts measured zeros and suppressed small cohorts", () => {
    expect(acquisitionAnalyticsSchema.parse(data).totals.profileCompleted.value).toBe(0);
    expect(acquisitionAnalyticsSchema.parse({ ...data, totals: { ...counts, acquisitions: { state: "suppressed", value: null, reason: "SMALL_COHORT_LT_5", source: "fan_product_events" } } }).totals.acquisitions.state).toBe("suppressed");
  });
  it("rejects small available counts, unsafe dimensions, raw identities and reversed windows", () => {
    for (const invalid of [
      { ...data, totals: { ...counts, acquisitions: metric(4) } },
      { ...data, rows: [{ ...data.rows[0], channel: "https://private.example" }] },
      { ...data, rows: [{ ...data.rows[0], anonymousSessionHash: "private" }] },
      { ...data, totals: { ...counts, acquisitions: { ...metric(10), userId: "private" } } },
      { ...data, from: data.to, to: data.from },
    ]) expect(acquisitionAnalyticsSchema.safeParse(invalid).success).toBe(false);
  });
});
