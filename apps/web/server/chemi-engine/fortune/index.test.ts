import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { fortuneGrade } from "./index";

describe("v55 fortune grade contract", () => {
  it("covers all 49 scores with the five specified intervals", () => {
    const counts = new Map<string, number>();
    for (let score = 50; score <= 98; score++) {
      const grade = fortuneGrade(score);
      expect(score).toBeGreaterThanOrEqual(grade.min);
      expect(score).toBeLessThanOrEqual(grade.max);
      expect(fortuneGrade(score)).toEqual(grade);
      counts.set(grade.name, (counts.get(grade.name) ?? 0) + 1);
    }
    expect(Object.fromEntries(counts)).toEqual({
      "쉬어 가는 날": 10, "조심하면 괜찮은 날": 10,
      "무난한 날": 10, "좋은 날": 10, "아주 좋은 날": 9,
    });
  });
  it.each([49, 99, 70.5, NaN, Infinity, -Infinity])("rejects invalid score %s", (score) => {
    expect(() => fortuneGrade(score)).toThrow(RangeError);
  });
});
