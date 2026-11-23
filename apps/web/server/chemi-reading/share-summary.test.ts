import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { calculateSaju } from "@/server/chemi-engine/saju";
import { computeDailyFortune } from "@/server/chemi-engine/fortune";
import { shareSummary } from "./share-summary";

const chart = calculateSaju({ year: 1995, month: 5, day: 5, hour: 14, minute: 0 } as Parameters<typeof calculateSaju>[0]);

describe("shareSummary", () => {
  it("builds the fortune share line, title and keywords from the saved result without birth data", () => {
    const result = computeDailyFortune(chart as never, "2026-11-23") as Record<string, any>;
    const summary = shareSummary("changha", result, null);
    expect(summary).toMatchObject({ score: result.score, grade: result.grade.name });
    expect(typeof summary.line).toBe("string");
    expect((summary.line as string).length).toBeGreaterThan(5);
    expect(typeof summary.title).toBe("string");
    expect(summary.keywords).toEqual({ fandom: result.fields.fandom, color: result.luck.color, luckyHour: result.luck.luckyHour ?? null });
    expect(JSON.stringify(summary)).not.toMatch(/1995|pillars|evidence/);
  });

  it("keeps a styled share line when one exists", () => {
    const result = computeDailyFortune(chart as never, "2026-11-23");
    expect(shareSummary("yuna", result, { share: { line: "말투 줄" } }).line).toBe("말투 줄");
  });

  it("gives saju the day-stem headline only", () => {
    const summary = shareSummary("elina", chart, null);
    expect(Object.keys(summary)).toEqual(["line"]);
    expect(summary.line).toMatch(/처럼, .+ 사람$/);
  });

  it("returns an empty summary for other results", () => {
    expect(shareSummary("changha", { cards: [{ card: 3 }] }, null)).toEqual({});
    expect(shareSummary("changha", null, undefined)).toEqual({});
  });
});
