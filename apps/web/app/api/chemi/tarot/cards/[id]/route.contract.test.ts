import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { GET } from "./route";
import { TAROT_DECK_SIZE, tarotCardContent } from "@/server/chemi-tarot/cards";

const ask = (id: string) => GET(new Request("http://test/api/chemi/tarot/cards/" + id), { params: Promise.resolve({ id }) });
afterEach(() => vi.unstubAllEnvs());

it("keeps the closed tab private", async () => {
  vi.stubEnv("CHEMI_TAB", "false");
  expect((await ask("0")).status).toBe(404);
});

it("answers one card by deck number and rejects anything else", async () => {
  vi.stubEnv("CHEMI_TAB", "true");
  const response = await ask("13");
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ id: 13, name: "죽음" });
  for (const id of ["78", "-1", "abc", "1.5", "007"]) expect((await ask(id)).status).toBe(404);
});

it("has all 78 cards with both directions, four rows and three voices", () => {
  expect(TAROT_DECK_SIZE).toBe(78);
  for (let id = 0; id < TAROT_DECK_SIZE; id += 1) {
    const card = tarotCardContent(id)!;
    expect(card.id).toBe(id);
    expect(card.name.length).toBeGreaterThan(0);
    expect(card.symbol.length).toBeGreaterThan(40);
    for (const direction of [card.dir.up, card.dir.down]) {
      expect(direction.rows.map(([label]) => label)).toEqual(["연애", "일", "돈", "조언"]);
      for (const voice of ["ban", "yo", "hao"] as const) {
        expect(direction.talk[voice]).toHaveLength(2);
        expect(direction.react[voice].length).toBeGreaterThan(0);
      }
    }
  }
  expect(tarotCardContent(78)).toBeNull();
});
