import { describe, expect, it } from "vitest";
import { participationWindow, readingExp, type ReadingContent } from "./policy";

describe("reading EXP policy", () => {
  it.each<[ReadingContent, number]>([["saju",20],["fortune",10],["star",10],["tarot",10]])("caps %s at three favorites", (content, amount) => {
    const input = { content, isFavorite: true, isToday: true, alreadyRewarded: false, rewardedFavorites: 2 };
    expect(readingExp(input)).toBe(amount);
    expect(readingExp({ ...input, rewardedFavorites: 3 })).toBe(0);
    expect(readingExp({ ...input, alreadyRewarded: true })).toBe(0);
    expect(readingExp({ ...input, isFavorite: false })).toBe(0);
    expect(readingExp({ ...input, isToday: false })).toBe(0);
  });
});

describe("participation window", () => {
  it("widens at the seven-user boundary and hides zero", () => {
    expect(participationWindow({ today: 7, week: 20, all: 30 })).toEqual({ period: "today", count: 7 });
    expect(participationWindow({ today: 6, week: 7, all: 30 })).toEqual({ period: "week", count: 7 });
    expect(participationWindow({ today: 6, week: 6, all: 6 })).toEqual({ period: "all", count: 6 });
    expect(participationWindow({ today: 0, week: 0, all: 0 })).toBeNull();
  });
});
