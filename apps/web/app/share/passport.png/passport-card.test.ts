import { describe, expect, it } from "vitest";
import { cardDate, machineLine } from "./passport-card";

describe("shared Passport card", () => {
  it("writes the issue date in Korea time", () => {
    expect(cardDate("2026-11-19T15:30:00+00:00")).toBe("2026.11.20");
  });

  it("keeps the machine line at 36 characters", () => {
    expect(machineLine("elina")).toBe(`P<KYAA<ELINA${"<".repeat(24)}`);
    expect(machineLine("a-very-long-creator-slug-that-goes-past-the-line")).toHaveLength(36);
  });
});
