import { describe, expect, it } from "vitest";
import cards from "@/content/chemi/tarot/cards.json";

const sentences = (text: string) => text.trim().split(/(?<=[.!?])\s+/);

// 최애 대사(talk·react)는 최애 말투를 따른다(엘리나는 반존대 — K-3729a7). 화면 해설만 해요체로 맞춘다.
describe("타로 풀이 표 해설 말투", () => {
  it("그림 속 상징과 오늘의 뜻은 해요체(명사로 끝나는 짧은 줄은 그대로)", () => {
    for (const card of cards) {
      const texts = [card.symbol, card.dir.up.lead, card.dir.down.lead];
      for (const sentence of texts.flatMap(sentences)) expect(sentence, card.name).not.toMatch(/다\.$/);
    }
  });
});
