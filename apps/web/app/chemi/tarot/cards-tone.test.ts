import { describe, expect, it } from "vitest";
import cards from "@/content/chemi/tarot/cards.json";
import { fortuneEnterLine, fortuneTalkLine } from "../fortune/lines";

const sentences = (text: string) => text.trim().split(/(?<=[.!?])\s+/);

describe("타로 풀이 표 말투", () => {
  it("그림 속 상징과 오늘의 뜻은 해요체(명사로 끝나는 짧은 줄은 그대로)", () => {
    for (const card of cards) {
      const texts = [card.symbol, card.dir.up.lead, card.dir.down.lead];
      for (const sentence of texts.flatMap(sentences)) expect(sentence, card.name).not.toMatch(/다\.$/);
    }
  });
  it("요체 최애(엘리나)의 대사에는 반말 문장이 섞이지 않는다", () => {
    for (const card of cards)
      for (const dir of [card.dir.up, card.dir.down])
        for (const sentence of [...dir.talk.yo, dir.react.yo].flatMap(sentences))
          expect(sentence, card.name).toMatch(/(요|죠)[.!?]$/);
  });
});

describe("운세 대화 엘리나 말투", () => {
  const input = { score: 85, grade: "좋은 날", fandom: 82, money: 70, people: 60, luckyHour: null, color: "파란" };
  it("입장과 1/4 한마디가 요체로 끝난다", () => {
    for (const sentence of [fortuneEnterLine("elina", "보석"), fortuneTalkLine("elina", 1, input)].flatMap(sentences))
      expect(sentence).toMatch(/(요|죠)[.!?]$/);
  });
});
