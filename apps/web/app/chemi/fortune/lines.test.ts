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
    "오늘은 82점, 좋은 날이야. 하던 일이 술술 풀려. 오늘은 내가 응원 제대로 해 줄게.",
  );
  expect(fortuneTalkLine("changha", 1, input)).toBe(fortuneTalkLine("changha", 1, input));
  expect(fortuneTalkLine("dosa", 4, input)).toContain("9시에서 11시 사이");
  expect(fortuneTalkLine("elina", 3, { ...input, fandom: 60, people: 40 })).toContain("출석 체크");
  expect(fortuneTalkLine("yuna", 4, { ...input, luckyHour: null })).not.toContain("시");
});

it("gives the same result a different line and choices for each creator", () => {
  const calm = { ...input, score: 74, grade: "무난한 날", fandom: 60 };
  expect(fortuneTalkLine("changha", 1, calm, "원문 제목")).toBe("오늘은 74점, 무난한 날이야. 평소처럼만 해도 충분해. 알지?");
  expect(fortuneTalkLine("elina", 1, calm, "원문 제목")).toBe("오늘은 74점, 무난한 날이에요. 오늘은 편하게 흘러가요. 밥 잘 챙겨 먹고 하던 대로 해요.");
  expect(fortuneTalkLine("yuna", 1, calm, "원문 제목")).toBe("74점, 무난한 날이야. 특별한 건 없어. 하던 대로 하면 돼.");
  for (const talk of [1, 2, 3, 4] as const) {
    const lines = (["changha", "elina", "yuna"] as const).map((who) => fortuneTalkLine(who, talk, calm));
    expect(new Set(lines).size, `talk ${talk}`).toBe(3);
  }
  expect(fortuneTalkLine("changha", 4, input)).toContain("초록색 물건도 하나 챙기고");
  expect(fortuneTalkLine("elina", 4, input)).toContain("초록색 물건 하나 챙겨요");
  expect(fortuneTalkLine("yuna", 4, input)).toContain("초록색 물건 딱 하나만");
  expect(fortuneChoiceLabel("changha", 3, "next", { ...calm, money: 40 })).toBe("지갑 말고 뭘 챙겨?");
  expect(fortuneChoiceLabel("elina", 3, "next", { ...calm, money: 40 })).toBe("지갑 대신 뭘 챙길까?");
  expect(fortuneChoiceLabel("dosa", 2, "next", { ...calm, people: 40 })).toBe("혼자 덕질하면 될까요?");
  expect(fortuneChoiceLabel("changha", 3, "skip", calm)).toBeNull();
  expect(fortuneChoiceLabel("changha", 4, "next", calm)).toBeNull();
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
  expect(fortuneTalkLine("elina", 1, input, headline)).toMatch(/하던 일이 술술 풀릴 거예요\. 오늘은 마음 편히 가도 돼\.$/);
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

it("does not use job metaphors (shooting, singing, make-up) in any creator line", () => {
  const job = /촬영|대본|카메라|리허설|노래|소절|가사|옷|화장|피부|톤|포인트 색|소품/;
  const grades = ["쉬어 가는 날", "조심하면 괜찮은 날", "무난한 날", "좋은 날", "아주 좋은 날"];
  for (const character of ["changha", "elina", "yuna"] as const)
    for (const grade of grades)
      for (const talk of [1, 2, 4] as const) expect(fortuneTalkLine(character, talk, { ...input, grade, people: 40 }), `${character} ${grade}`).not.toMatch(job);
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

const characters = ["changha", "elina", "yuna", "dosa"] as const;
const grades = ["쉬어 가는 날", "조심하면 괜찮은 날", "무난한 날", "좋은 날", "아주 좋은 날"];
const bands = [45, 70, 90];

// 대표 제보 192654·192655: 2/4 '말 줄이는 날' 아래 '오늘 영상 봐도 돼?', 3/4 덕질 57점을 '짧은 영상'으로만 풀던 장면.
it("asks what follows from the line just said and answers it on the next page (CHEMI-FORTUNE-DIALOG-1125)", () => {
  const day = { ...input, score: 74, grade: "무난한 날", people: 45, fandom: 57, money: 61 };
  expect(fortuneTalkLine("changha", 2, day)).toBe("오늘은 누구랑 있든 말 줄이는 게 좋아. 듣는 쪽이 편할 거야.");
  expect(fortuneChoiceLabel("changha", 1, "next", day)).toBe("사람 쪽도 괜찮아?");
  expect(fortuneChoiceLabel("changha", 2, "next", day)).toBe("그럼 혼자 덕질할까?");
  expect(fortuneChoiceLabel("changha", 2, "skip", day)).toBe("언제 말 걸면 좋아?");
  expect(fortuneTalkLine("changha", 3, day)).toBe(
    "혼자 쉬엄쉬엄 하자. 갖고 있는 포카 정리하면 딱이야. 돈은 평소대로. 살 건 저녁에 한 번 더 보고 정해.",
  );
  expect(fortuneChoiceLabel("changha", 1, "next", { ...day, grade: "조심하면 괜찮은 날" })).toBe("누구한테 조심해야 돼?");
  expect(fortuneChoiceLabel("changha", 1, "next", { ...day, grade: "쉬어 가는 날", people: 70 })).toBe("그 약속, 누구랑 잡지?");
  expect(fortuneChoiceLabel("changha", 1, "next", { ...day, grade: "좋은 날", people: 90 })).toBe("누구 덕에 잘 풀려?");
  expect(fortuneChoiceLabel("changha", 2, "next", { ...day, people: 90 })).toBe("덕질 친구도 만날까?");
  expect(fortuneChoiceLabel("changha", 2, "skip", { ...day, luckyHour: null })).toBe("챙길 것부터 알려 줘");
});

it("reads fan life as one concrete fan activity per score band and company, never the video-length formula", () => {
  for (const character of characters) {
    const fandomLines = new Set<string>();
    for (const fandom of bands)
      for (const people of bands)
        for (const money of bands)
          for (const grade of grades) {
            const day = { ...input, grade, fandom, people, money };
            const line = fortuneTalkLine(character, 3, day);
            expect(line, `${character} ${fandom}/${people}/${money}`).not.toMatch(/영상|길이|긴 건|짧은 거/);
            expect(line).toMatch(/직캠|응원 글|응원 댓글|출석|포카|장면/);
            expect(line).toMatch(/돈|재물/);
            expect(line).not.toMatch(/부탁|청|결제/);
            fandomLines.add(fortuneTalkLine(character, 3, { ...day, money: 70 }));
            for (const talk of [1, 2, 3, 4] as const)
              for (const slot of ["next", "skip"] as const) {
                const label = fortuneChoiceLabel(character, talk, slot, day);
                if (talk === 4 || (talk === 3 && slot === "skip")) expect(label).toBeNull();
                else expect((label ?? "").length, `${character} ${talk} ${slot} ${label}`).toBeLessThanOrEqual(13);
              }
          }
    expect(fandomLines.size, character).toBe(9);
  }
});

it("does not presuppose a meeting when the people page was skipped", () => {
  for (const character of characters) {
    const line = fortuneTalkLine(character, 3, { ...input, people: 95, fandom: 45 }, null, "fandom");
    expect(line).not.toMatch(/만나/);
  }
});

it("answers '언제 말 걸면 좋아?' directly and keeps the hand-off line when there is no lucky hour", () => {
  expect(fortuneTalkLine("changha", 4, input, null, "luck")).toMatch(/^부탁할 거 있으면 9시에서 11시 사이에 해\./);
  expect(fortuneTalkLine("changha", 4, { ...input, luckyHour: null }, null, "luck")).toMatch(/^챙길 것부터 묻네\. 좋아\./);
  expect(fortuneTalkLine("dosa", 4, { ...input, luckyHour: null })).toBe("초록빛 물건 하나를 챙기시오.");
});
