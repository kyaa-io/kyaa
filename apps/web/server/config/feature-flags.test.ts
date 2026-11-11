import { describe, expect, it } from "vitest";
import { jjinfanGaugeEnabled } from "./feature-flags";

describe("jjinfanGaugeEnabled", () => {
  it("stays off in production unless explicitly turned on", () => {
    expect(jjinfanGaugeEnabled({ BYUS_DATA_ENVIRONMENT: "production" })).toBe(false);
    expect(jjinfanGaugeEnabled({})).toBe(false);
    expect(jjinfanGaugeEnabled({ BYUS_DATA_ENVIRONMENT: "production", KYAA_FEATURE_JJINFAN_GAUGE: "true" })).toBe(true);
  });
  it("is on in development data environments and can be turned off", () => {
    expect(jjinfanGaugeEnabled({ BYUS_DATA_ENVIRONMENT: "development" })).toBe(true);
    expect(jjinfanGaugeEnabled({ BYUS_DATA_ENVIRONMENT: "development", KYAA_FEATURE_JJINFAN_GAUGE: "false" })).toBe(false);
  });
});
