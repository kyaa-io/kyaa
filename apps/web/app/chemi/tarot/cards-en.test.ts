import { describe, expect, it } from "vitest";
import cards from "@/content/chemi/tarot/cards.json";
import cardsEn from "@/content/chemi/tarot/cards.en.json";
import { TAROT_DECK, TAROT_DECK_EN, tarotTitle } from "@/features/chemi/tarot/deck";
import { tarotBasis, tarotRowMore } from "@/features/chemi/tarot/depth";
import { tarotLines, TAROT_CHARACTERS, tarotCharacter } from "@/features/chemi/tarot/script";

const hangul = /[\uac00-\ud7a3]/;
const shape = (card: (typeof cards)[number]) => ({
  id: card.id,
  num: card.num,
  rows: (["up", "down"] as const).map((side) => card.dir[side].rows.length),
  talk: (["up", "down"] as const).map((side) => Object.keys(card.dir[side].talk).sort()),
  react: (["up", "down"] as const).map((side) => Object.keys(card.dir[side].react).sort()),
});

// 운영 오픈 점검표 Q4-A: 한국어 밖의 언어는 영어 글을 보여 준다. 78장 모두 한국어 표와 같은 모양이고 한글이 없어야 한다.
describe("영어 타로 풀이 표", () => {
  it("has all 78 cards in the Korean table's order and shape, with no Korean", () => {
    expect(cardsEn).toHaveLength(78);
    expect(cardsEn.map(shape)).toEqual(cards.map(shape));
    expect(JSON.stringify(cardsEn)).not.toMatch(hangul);
    for (const card of cardsEn) for (const side of ["up", "down"] as const) expect(card.dir[side].rows.map(([label]) => label)).toEqual(["Love", "Work", "Money", "Advice"]);
  });
  it("names and describes every card in English on screen, from the same deck order", () => {
    expect(TAROT_DECK_EN.map(([num]) => num)).toEqual(TAROT_DECK.map(([num]) => num));
    expect(TAROT_DECK_EN.map(([, name, alt]) => [name, alt])).toEqual(cardsEn.map((card) => [card.name, card.alt]));
    expect(tarotTitle(0, "en")).toBe("0 The Fool");
    expect(tarotTitle(13, "ja")).toBe("XIII Death");
    expect(tarotTitle(13, "ko")).toBe("XIII 죽음");
  });
  it("gives English basis rows, row notes, lines and names", () => {
    for (let id = 0; id < 78; id += 1)
      for (const reversed of [false, true]) expect(JSON.stringify(tarotBasis(id, reversed, "en"))).not.toMatch(hangul);
    expect(tarotRowMore(30, "Money")).toMatch(/^As a fast card/);
    expect(tarotRowMore(30, "돈")).toBe("속도가 빠른 카드라 쓰는 것도 빨라져요.");
    for (const { key } of TAROT_CHARACTERS) {
      const lines = tarotLines(key, "en");
      expect(JSON.stringify(lines) + lines.drawn("Death", true) + tarotCharacter(key, "en").name).not.toMatch(hangul);
    }
  });
});
