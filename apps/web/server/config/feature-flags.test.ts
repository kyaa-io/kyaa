import { describe, expect, it } from "vitest";
import { jjinfanGaugeEnabled, quizLearnEnabled } from "./feature-flags";

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

it("quiz learning requires explicit dev opt-in and never enables production", () => {
 expect(quizLearnEnabled({})).toBe(false);
 expect(quizLearnEnabled({BYUS_DATA_ENVIRONMENT:"development"})).toBe(false);
 expect(quizLearnEnabled({BYUS_DATA_ENVIRONMENT:"development",KYAA_FEATURE_QUIZ_LEARN:"false"})).toBe(false);
 expect(quizLearnEnabled({BYUS_DATA_ENVIRONMENT:"development",KYAA_FEATURE_QUIZ_LEARN:"true"})).toBe(true);
 expect(quizLearnEnabled({BYUS_DATA_ENVIRONMENT:"production",KYAA_FEATURE_QUIZ_LEARN:"true"})).toBe(false);
});
