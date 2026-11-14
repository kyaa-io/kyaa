import { describe, expect, it } from "vitest";
import { formatFollowerCount, parseFollowerInput } from "./platform-followers";

describe("parseFollowerInput", () => {
  it("empty is unconfirmed, 0 is a confirmed zero", () => {
    expect(parseFollowerInput("")).toBeNull();
    expect(parseFollowerInput("   ")).toBeNull();
    expect(parseFollowerInput("0")).toEqual({ count: 0, digits: null, sourceText: null });
  });
  it("a plain number is exact, with or without thousands commas", () => {
    expect(parseFollowerInput("1088")).toEqual({ count: 1088, digits: null, sourceText: null });
    expect(parseFollowerInput("1,088")).toEqual({ count: 1088, digits: null, sourceText: null });
  });
  it("a number with a unit keeps the platform's wording and says how many digits are real", () => {
    expect(parseFollowerInput("1.2만")).toEqual({ count: 12000, digits: 2, sourceText: "1.2만" });
    expect(parseFollowerInput("50K")).toEqual({ count: 50000, digits: 2, sourceText: "50K" });
    expect(parseFollowerInput("17.3M")).toEqual({ count: 17300000, digits: 3, sourceText: "17.3M" });
    expect(parseFollowerInput("0.5k")).toEqual({ count: 500, digits: 1, sourceText: "0.5k" });
    expect(parseFollowerInput("1.5억")).toEqual({ count: 150000000, digits: 2, sourceText: "1.5억" });
  });
  it("anything else is not a count", () => {
    for (const bad of ["abc", "-5", "1.2.3", "12,34", "1.2345K", "1e5", "만", "12 명"]) expect(parseFollowerInput(bad)).toBeUndefined();
  });
});

describe("formatFollowerCount", () => {
  it("shows under 1,000 as is, 0 included", () => {
    expect(formatFollowerCount(0)).toBe("0");
    expect(formatFollowerCount(999)).toBe("999");
  });
  it("shrinks 1,000 and up to K/M with one decimal, always rounding down", () => {
    expect(formatFollowerCount(1000)).toBe("1K");
    expect(formatFollowerCount(1088)).toBe("1K");
    expect(formatFollowerCount(12345)).toBe("12.3K");
    expect(formatFollowerCount(19960)).toBe("19.9K");
    expect(formatFollowerCount(999999)).toBe("999.9K");
    expect(formatFollowerCount(17300000)).toBe("17.3M");
  });
  it("never shows more digits than a rounded count had", () => {
    expect(formatFollowerCount(19960, 2)).toBe("19K");
    expect(formatFollowerCount(1234567, 2)).toBe("1.2M");
    expect(formatFollowerCount(1234567, 1)).toBe("1M");
    expect(formatFollowerCount(12000, 3)).toBe("12K");
  });
  it("the platform's own wording wins", () => {
    expect(formatFollowerCount(12000, 2, "1.2만")).toBe("1.2만");
  });
});
