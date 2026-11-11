import { describe, expect, it } from "vitest";
import { stageGaugeCells } from "./my-passport-card";

const next = { key: "silver-2", tier: "Silver", subdivision: 2, rank: 3, minimumScore: 0 } as const;

describe("stageGaugeCells", () => {
  it("uses the remaining stamps as cells when the step is small", () => {
    expect(stageGaugeCells({ next, remaining: 3, progressPercent: 0 })).toEqual({ cells: 3, filled: 0 });
    expect(stageGaugeCells({ next, remaining: 3, progressPercent: 66 })).toEqual({ cells: 9, filled: 6 });
  });
  it("falls back to ten cells filled by ratio when the step is large", () => {
    expect(stageGaugeCells({ next, remaining: 500, progressPercent: 40 })).toEqual({ cells: 10, filled: 4 });
    expect(stageGaugeCells({ next, remaining: 500, progressPercent: 0 })).toEqual({ cells: 10, filled: 0 });
    expect(stageGaugeCells({ next, remaining: 40, progressPercent: 99 })).toEqual({ cells: 10, filled: 9 });
  });
  it("shows a full gauge at the top stage", () => {
    expect(stageGaugeCells({ next: null, remaining: 0, progressPercent: 100 })).toEqual({ cells: 10, filled: 10 });
  });
});
