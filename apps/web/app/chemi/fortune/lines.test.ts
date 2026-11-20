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
  expect(fortuneTalkLine("dosa", 4, input)).toContain("9시에서 11시 사이");
  expect(fortuneTalkLine("elina", 3, { ...input, fandom: 60 })).toContain("천천히");
  expect(fortuneTalkLine("yuna", 4, { ...input, luckyHour: null })).not.toContain("시");
});

it("keeps kyaa 도사 in 하오체 for every grade and branch", () => {
  const grades = ["쉬어 가는 날", "조심하면 괜찮은 날", "무난한 날", "좋은 날", "아주 좋은 날"];
  const lines = grades.flatMap((grade) =>
    ([1, 2, 3, 4] as const).flatMap((talk) => [
      fortuneTalkLine("dosa", talk, { ...input, grade }),
      fortuneTalkLine("dosa", talk, { ...input, grade, people: 40, fandom: 40, luckyHour: null }),
    ]),
  );
  for (const line of lines) {
    for (const sentence of line.split(/(?<=[.?!])\s+/)) {
      expect(sentence, line).not.toMatch(/(거야|해|줘|자)[.?!]?$/);
    }
  }
  expect(fortuneTalkLine("dosa", 1, { ...input, grade: "무난한 날" })).toBe(
    "오늘은 82점, 무난한 날이구려. 큰일 없이 편안히 흘러가겠소.",
  );
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

it.each([0, 11, 12, 13, 19, 23])("uses 24-hour time for a window beginning at %i", (start) => {
  const end = (start + 2) % 24;
  const line = fortuneTalkLine("changha", 4, { ...input, luckyHour: { start, end } });
  expect(line).toContain(`${start}시에서 ${end}시 사이`);
  expect(line).not.toMatch(/오전|오후/);
});
