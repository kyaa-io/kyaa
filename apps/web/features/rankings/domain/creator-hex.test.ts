import { describe, expect, it } from "vitest";
import { rankCreatorHex } from "./creator-hex";

const zero = { likes: 0, stamps: 0, votes: 0, followers: 0, reactions: 0, news: 0 };

describe("creator hex ranking", () => {
  it("normalizes each axis independently and weights the two groups", () => {
    const ranked = rankCreatorHex([
      { slug: "outside", metrics: { ...zero, followers: 90000, reactions: 3.5, news: 5 } },
      { slug: "inside", metrics: { ...zero, likes: 20, stamps: 8, votes: 200 } },
      { slug: "half", metrics: { ...zero, likes: 10 } },
    ]);
    expect(ranked.map(row => row.score)).toEqual([60, 40, 10]);
    expect(ranked[2].scores.likes).toBe(50);
  });
  it("keeps empty axes at zero and breaks ties by slug", () => {
    const ranked = rankCreatorHex(["b", "a"].map(slug => ({ slug, metrics: zero })));
    expect(ranked.map(row => [row.slug, row.score])).toEqual([["a", 0], ["b", 0]]);
  });
});
