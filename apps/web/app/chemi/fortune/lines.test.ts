import { expect, it } from "vitest";
import { maskBirthDate, parseBirthDate } from "./birth-sheet";
import { fortuneChoiceLabel, fortuneTalkLine } from "./lines";
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
    "오늘은 82점, 좋은 날이야. 하던 일이 술술 풀리는 날이야.",
  );
  expect(fortuneTalkLine("changha", 1, input)).toBe(fortuneTalkLine("changha", 1, input));
  expect(fortuneTalkLine("dosa", 4, input)).toContain("9시에서 11시 사이");
  expect(fortuneTalkLine("elina", 3, { ...input, fandom: 60 })).toContain("천천히");
  expect(fortuneTalkLine("yuna", 4, { ...input, luckyHour: null })).not.toContain("시");
});

it("gives the same result a different line and choices for each creator", () => {
  const calm = { ...input, score: 74, grade: "무난한 날", fandom: 60 };
  expect(fortuneTalkLine("changha", 1, calm, "원문 제목")).toBe("오늘은 74점, 무난한 날이야. 다시 찍을 것 없이 한 번에 넘어가는 날이지.");
  expect(fortuneTalkLine("elina", 1, calm, "원문 제목")).toBe("오늘은 74점, 무난한 날이에요. 늘 입던 옷처럼 편하게 흘러가는 날이지?");
  expect(fortuneTalkLine("yuna", 1, calm, "원문 제목")).toBe("74점, 무난한 날이야. 매일 하던 화장처럼 하던 대로 하면 돼.");
  for (const talk of [1, 2, 3, 4] as const) {
    const lines = (["changha", "elina", "yuna"] as const).map((who) => fortuneTalkLine(who, talk, calm));
    expect(new Set(lines).size, `talk ${talk}`).toBe(3);
  }
  expect(fortuneTalkLine("changha", 4, input)).toContain("초록색 소품");
  expect(fortuneTalkLine("elina", 4, input)).toContain("옷에 초록색");
  expect(fortuneTalkLine("yuna", 4, input)).toContain("초록색은 포인트로");
  expect(fortuneChoiceLabel("changha", "whatFandom")).toBe("오늘 영상 봐도 돼?");
  expect(fortuneChoiceLabel("elina", "whatBring")).toBe("오늘 뭐 입을까?");
  expect(fortuneChoiceLabel("yuna", "whatBring")).toBe("포인트 색은 뭐야?");
  expect(fortuneChoiceLabel("dosa", "whatFandom")).toBeNull();
  expect(fortuneChoiceLabel("changha", "dailySummary")).toBeNull();
  // 유나는 느낌표 없이 담백하게, 엘리나는 한 대사 안에 존댓말과 반말을 섞는다.
  for (const talk of [1, 2, 3, 4] as const) expect(fortuneTalkLine("yuna", talk, calm)).not.toContain("!");
  expect(fortuneTalkLine("elina", 2, { ...calm, people: 40 })).toMatch(/봐요\. .+괜찮아\.$/);
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

it("uses the character’s own grade explanation when a reading includes a casual headline", () => {
  const headline = "잠깐 숨을 돌려 봐";
  expect(fortuneTalkLine("elina", 1, input, headline)).toMatch(/하던 일이 술술 풀리는 날이에요\.$/);
  expect(fortuneTalkLine("elina", 1, input, headline)).not.toContain(headline);
  expect(fortuneTalkLine("dosa", 1, input, headline)).not.toContain(headline);
  for (const character of ["changha", "yuna"] as const) {
    expect(fortuneTalkLine(character, 1, input, headline)).not.toContain(headline);
  }
});

it("keeps favour advice on the lucky-hour line only so the four pages never disagree", () => {
  const grades = ["쉬어 가는 날", "조심하면 괜찮은 날", "무난한 날", "좋은 날", "아주 좋은 날"];
  for (const character of ["changha", "elina", "yuna", "dosa"] as const)
    for (const grade of grades)
      for (const people of [40, 90]) {
        const day = { ...input, grade, people };
        for (const talk of [1, 2, 3] as const) expect(fortuneTalkLine(character, talk, day), `${character} ${grade} ${talk}`).not.toMatch(/부탁|청/);
        expect(fortuneTalkLine(character, 4, day)).toMatch(/9시에서 11시 사이/);
        expect(fortuneTalkLine(character, 4, { ...day, luckyHour: null })).not.toMatch(/부탁|청하/);
      }
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
