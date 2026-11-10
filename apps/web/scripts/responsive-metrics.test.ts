import { describe, expect, it } from "vitest";
// @ts-expect-error 순수 JS 모듈
import { evaluate, judgeMargins, judgeParagraph, judgeRow, overflowX, summarize } from "./responsive-metrics.mjs";

const ko = "가".repeat(30) + " " + "나".repeat(30);
describe("responsive metrics", () => {
  it("detects horizontal overflow", () => {
    expect(overflowX({ scrollWidth: 391, clientWidth: 390 })).toBe(true);
    expect(overflowX({ scrollWidth: 390, clientWidth: 390 })).toBe(false);
  });
  it("judges Korean line length (warn >45, fail >60)", () => {
    const base = { text: ko, height: 48, lineHeight: 24, fontSize: 16 };
    expect(judgeParagraph({ ...base, width: 16 * 0.95 * 40 }).status).toBe("ok");
    expect(judgeParagraph({ ...base, width: 16 * 0.95 * 50 }).status).toBe("warn");
    expect(judgeParagraph({ ...base, width: 16 * 0.95 * 65 }).status).toBe("fail");
  });
  it("judges Latin line length (warn >75, fail >100) and skips one-line text", () => {
    const text = "word ".repeat(40);
    const base = { text, height: 48, lineHeight: 24, fontSize: 16 };
    expect(judgeParagraph({ ...base, width: 8 * 80 }).status).toBe("warn");
    expect(judgeParagraph({ ...base, width: 8 * 110 }).status).toBe("fail");
    expect(judgeParagraph({ ...base, height: 24, width: 8 * 200 }).status).toBe("skip");
  });
  it("flags row gaps over 40% only at >=1024", () => {
    const row = { width: 1000, nameRight: 100, valueLeft: 600 };
    expect(judgeRow(row, 1024).status).toBe("fail");
    expect(judgeRow(row, 390).status).toBe("skip");
    expect(judgeRow({ ...row, valueLeft: 500 }, 1440).status).toBe("ok");
  });
  it("flags outer margin difference over 2px", () => {
    expect(judgeMargins({ left: 16, right: 18 }).status).toBe("ok");
    expect(judgeMargins({ left: 16, right: 19 }).status).toBe("fail");
  });
  it("evaluates and summarizes", () => {
    const { failures } = evaluate({ scrollWidth: 500, clientWidth: 390, paragraphs: [], rows: [], margins: { left: 16, right: 16 } }, 390);
    expect(failures.map((f: { rule: string }) => f.rule)).toEqual(["overflow-x"]);
    const s = summarize([{ route: "/", width: 390, failures, warnings: [] }]);
    expect(s.failed).toBe(1);
    expect(s.text).toContain("FAIL");
  });
});
