import { expect, it } from "vitest";
import { maskBirthDate, parseBirthDate } from "./birth-sheet";
import { fortuneTalkLine } from "./lines";
import {
  nextFortuneStep,
  parseFortuneStep,
  reachableFortuneStep,
} from "@/features/chemi/domain/step";

const input = {
  score: 82,
  grade: "좋은 날",
  fandom: 91,
  money: 71,
  people: 88,
  luckyHour: { start: 9, end: 11 },
  color: "초록",
};

it("builds the same line for the same input and keeps each character's tone", () => {
  expect(fortuneTalkLine("changha", 1, input)).toBe(
    "오늘은 82점, 좋은 날이야. 누가 먼저 손 내밀어 줄 수도 있어.",
  );
  expect(fortuneTalkLine("changha", 1, input)).toBe(fortuneTalkLine("changha", 1, input));
  expect(fortuneTalkLine("dosa", 4, input)).toContain("오전 9시에서 11시 사이");
  expect(fortuneTalkLine("elina", 3, { ...input, fandom: 60 })).toContain("천천히");
  expect(fortuneTalkLine("yuna", 4, { ...input, luckyHour: null })).not.toContain("시");
});

it("masks birth digits and rejects impossible dates", () => {
  expect(maskBirthDate("19950505abc")).toBe("1995.05.05");
  expect(maskBirthDate("1995")).toBe("1995");
  expect(parseBirthDate("1995.05.05")).toBe("1995-05-05");
  expect(parseBirthDate("1995.02.30")).toBeNull();
  expect(parseBirthDate("2999.01.01")).toBeNull();
  expect(parseBirthDate("1995.05.0")).toBeNull();
});

it("sends a step without a reading back to the entrance", () => {
  expect(parseFortuneStep("talk-9")).toBe("enter");
  expect(reachableFortuneStep("result", false)).toBe("enter");
  expect(reachableFortuneStep("calc", true)).toBe("talk-1");
  expect(reachableFortuneStep("talk-3", true)).toBe("talk-3");
  expect(nextFortuneStep("talk-4")).toBe("result");
});
