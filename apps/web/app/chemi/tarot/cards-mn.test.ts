import { describe, expect, it } from "vitest";
import cards from "@/content/chemi/tarot/cards.json";
import cardsMn from "@/content/chemi/tarot/cards.mn.json";
import { TAROT_DECK, TAROT_DECK_MN, tarotTitle } from "@/features/chemi/tarot/deck";
import { tarotBasis, tarotRowMore } from "@/features/chemi/tarot/depth";
import { tarotLines, TAROT_CHARACTERS, tarotLang } from "@/features/chemi/tarot/script";
import { chemiPersona } from "@/features/chemi/persona";

const foreign = /[A-Za-z가-힣]/;
const shape = (card: (typeof cards)[number]) => ({
  id: card.id,
  num: card.num,
  rows: (["up", "down"] as const).map((side) => card.dir[side].rows.length),
  talk: (["up", "down"] as const).map((side) => Object.keys(card.dir[side].talk).sort()),
  react: (["up", "down"] as const).map((side) => Object.keys(card.dir[side].react).sort()),
});
const words = (card: (typeof cards)[number]) =>
  JSON.stringify([card.name, card.up, card.down, card.symbol, card.alt, ...(["up", "down"] as const).map((side) => {
    const dir = card.dir[side];
    return [dir.lead, dir.rows, dir.pair, dir.share, Object.values(dir.talk), Object.values(dir.react)];
  })]);

// 케미 97 9회차: 몽골어 화면은 영어 대체 대신 몽골어 풀이 글을 받는다. 78장 모두 한국어 표와 같은 모양이다.
describe("몽골어 타로 풀이 표", () => {
  it("has all 78 cards in the Korean table's order and shape, in Cyrillic only", () => {
    expect(cardsMn).toHaveLength(78);
    expect(cardsMn.map(shape)).toEqual(cards.map(shape));
    for (const card of cardsMn) {
      expect(words(card), card.name).not.toMatch(foreign);
      for (const side of ["up", "down"] as const) expect(card.dir[side].rows.map(([label]) => label)).toEqual(["Хайр", "Ажил", "Мөнгө", "Зөвлөгөө"]);
    }
  });
  it("names cards in Mongolian on screen, from the same deck order", () => {
    expect(tarotLang("mn")).toBe("mn");
    expect(tarotLang("ja")).toBe("en");
    expect(TAROT_DECK_MN.map(([num]) => num)).toEqual(TAROT_DECK.map(([num]) => num));
    expect(TAROT_DECK_MN.map(([, name, alt]) => [name, alt])).toEqual(cardsMn.map((card) => [card.name, card.alt]));
    expect(tarotTitle(0, "mn")).toBe("0 Тэнэг");
    expect(tarotTitle(52, "mn")).toBe("Сэлэмний гурав");
  });
  it("gives Mongolian basis rows, row notes, lines and persona lines", () => {
    for (let id = 0; id < 78; id += 1)
      for (const reversed of [false, true]) expect(JSON.stringify(tarotBasis(id, reversed, "mn").map(({ term, value, plain }) => [term, value, plain]))).not.toMatch(foreign);
    expect(tarotRowMore(30, "Мөнгө")).toBe("Хурдан хөзөр тул зарцуулалт ч хурдасна.");
    expect(tarotRowMore(30, "Зөвлөгөө")).toBeNull();
    for (const { key } of TAROT_CHARACTERS) {
      const lines = tarotLines(key, "mn");
      expect(Object.values(lines).filter((line) => typeof line === "string").join(" ") + lines.drawn("Үхэл", true)).not.toMatch(foreign);
    }
    for (const persona of Object.values(chemiPersona)) expect(persona.tarotRevisit.mn + persona.tarotResult.mn).not.toMatch(foreign);
  });
});
