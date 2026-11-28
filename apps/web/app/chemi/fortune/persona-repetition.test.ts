import { expect, it } from "vitest";
import { tarotLines } from "@/features/chemi/tarot/script";
import { fortuneCalcLine, fortuneEnterLine, fortuneTalkLine, type FortuneLineInput } from "./lines";

const grades = ["쉬어 가는 날", "조심하면 괜찮은 날", "무난한 날", "좋은 날", "아주 좋은 날"];
const bands = [45, 70, 90];
const input: FortuneLineInput = {
  score: 82,
  grade: "좋은 날",
  people: 70,
  fandom: 70,
  money: 70,
  color: "초록",
  luckyHour: { start: 9, end: 11 },
};

function sample(character: "changha" | "elina" | "yuna") {
  const tarot = tarotLines(character);
  const fandomWithMoney = (fandom: number, people: number, money: number) =>
    fortuneTalkLine(character, 3, { ...input, fandom, people, money });
  const middleLine = fandomWithMoney(70, 70, 70);
  const sharedSuffix = middleLine.slice(middleLine.lastIndexOf(" 돈은") + 1);
  const fandom = bands.flatMap((rating) =>
    bands.map((people) => fandomWithMoney(rating, people, 70).replace(` ${sharedSuffix}`, "")),
  );
  const fandomPrefix = fandom[4];
  const item = fortuneTalkLine(character, 4, { ...input, luckyHour: null });
  return [
    fortuneEnterLine(character, null),
    fortuneEnterLine(character, null, "birth"),
    fortuneCalcLine(character),
    ...grades.map((grade) => fortuneTalkLine(character, 1, { ...input, grade })),
    ...bands.map((people) => fortuneTalkLine(character, 2, { ...input, people })),
    ...fandom,
    ...bands.map((money) => fandomWithMoney(70, 70, money).slice(fandomPrefix.length + 1)),
    fortuneTalkLine(character, 4, input, null, null, "whenSay").split(". ")[0],
    fortuneTalkLine(character, 4, { ...input, luckyHour: { start: 13, end: 15 } }).split(". ")[0],
    item,
    tarot.hello, tarot.think, tarot.shuffle, tarot.lock,
  ];
}

const repeatedPhrases = [/하나만/u, /응원/u, /천천히/u, /내 덕이다/u, /(?:촬영|노래|화장)으로 치면/u];
const normalize = (line: string) => line.replace(/\d+/gu, "#").replace(/[^\p{L}#]+/gu, "");

it.each(["changha", "elina", "yuna"] as const)("%s 대사 표본에서 같은 틀과 단골 표현을 반복하지 않는다", (character) => {
  const lines = sample(character);
  expect(lines).toHaveLength(30);
  const templates = lines.map(normalize);
  expect(templates.every(Boolean)).toBe(true);
  expect(new Set(templates).size).toBe(templates.length);
  for (const phrase of repeatedPhrases) {
    expect(lines.filter((line) => phrase.test(line)), String(phrase)).toHaveLength(0);
  }
});
