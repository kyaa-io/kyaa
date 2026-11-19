import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { drawGuestTarot, drawMemberTarot } from "./index";
const input = { userId: "member-1", kstDate: "2026-11-18", deckVersion: "v1", salt: "test-only-".repeat(4) };
describe("tarot engine", () => {
  it("replays daily cards and three distinct ordered positions", () => {
    const cards = drawMemberTarot(input, 3);
    expect(cards).toEqual(drawMemberTarot(input, 3));
    expect(new Set(cards.map(c => c.card)).size).toBe(3);
    expect(drawMemberTarot(input)).not.toEqual(cards.slice(0, 1));
    expect(JSON.stringify(cards)).not.toContain(input.salt);
  });
  it("uses all seed components", () => {
    for (const change of [{ spread: "relationship" }, { topic: "work" }, { userId: "other" }, { kstDate: "2026-11-19" }, { deckVersion: "v2" }, { salt: "different-test-only".repeat(3) }]) {
      expect(drawMemberTarot({ ...input, ...change }, 3)).not.toEqual(drawMemberTarot(input, 3));
    }
  });
  it("fails closed without a configured secret", () => {
    for (const salt of [undefined, "short"]) expect(() => drawMemberTarot({ ...input, salt })).toThrow("CHEMI_CONTENT_OFF");
  });
  it("rejects invalid dates and identity", () => {
    expect(() => drawMemberTarot({ ...input, kstDate: "2026-02-30" })).toThrow();
    expect(() => drawMemberTarot({ ...input, userId: "" })).toThrow();
  });
  it("covers the deck with balanced independent orientations", () => {
    const cards = Array.from({ length: 7800 }, (_, i) => drawMemberTarot({ ...input, userId: String(i) })[0]);
    expect(new Set(cards.map(c => c.card)).size).toBe(78);
    expect(cards.filter(c => c.reversed).length / cards.length).toBeGreaterThan(.47);
    expect(cards.filter(c => c.reversed).length / cards.length).toBeLessThan(.53);
  });
  it("returns only a guest card", () => {
    const card = drawGuestTarot();
    expect(Object.keys(card).sort()).toEqual(["card", "reversed"]);
    expect(card.card).toBeGreaterThanOrEqual(0);
    expect(card.card).toBeLessThan(78);
  });
});
it("deals a distinct card at every position in the same spread", () => {
  const cards = Array.from({ length: 78 }, (_, position) =>
    drawMemberTarot({ ...input, position })[0].card);
  expect(new Set(cards).size).toBe(78);
});
