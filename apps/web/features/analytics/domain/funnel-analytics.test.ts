import { describe, expect, it } from "vitest";
import { funnelAnalyticsSchema, funnelRates } from "./funnel-analytics";

const data = funnelAnalyticsSchema.parse({
  days: 7, from: "2026-11-02T00:00:00Z", to: "2026-11-09T00:00:00Z", pageViewsSince: "2026-10-01T00:00:00Z",
  steps: { visitors: 1000, accountCreated: 50, fanVerified: 20, firstActivity: 0 },
});

describe("funnel rates", () => {
  it("divides each step by the previous one", () => {
    expect(funnelRates(data)).toEqual({ visitors: null, accountCreated: 0.05, fanVerified: 0.4, firstActivity: 0 });
  });
  it("does not divide by visits collected for only part of the period, or by zero", () => {
    expect(funnelRates({ ...data, pageViewsSince: "2026-11-05T00:00:00Z" }).accountCreated).toBeNull();
    expect(funnelRates({ ...data, pageViewsSince: null }).accountCreated).toBeNull();
    expect(funnelRates({ ...data, steps: { ...data.steps, fanVerified: 0 } }).firstActivity).toBeNull();
  });
});
