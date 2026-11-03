import { describe, expect, it } from "vitest";
import { communityHref, hotCommunities, parseCommunityTab, selectCommunityCreator } from "./navigation";

describe("community navigation", () => {
  const creators = [{ slug: "yuna", displayOrder: 1 }, { slug: "elina", displayOrder: 0 }, { slug: "changha", displayOrder: 0 }];
  it("selects a stable published creator and never substitutes an explicit missing creator", () => {
    expect(selectCommunityCreator(creators)?.slug).toBe("changha");
    expect(selectCommunityCreator([...creators].reverse())?.slug).toBe("changha");
    expect(selectCommunityCreator(creators, "elina")?.slug).toBe("elina");
    expect(selectCommunityCreator(creators, "unpublished")).toBeUndefined();
    expect(selectCommunityCreator(creators, "")).toBeUndefined();
    expect(selectCommunityCreator([])).toBeUndefined();
  });
  it("keeps artist, tab and language together and defaults unknown tabs to posts", () => {
    expect(communityHref("elina", "ja", "fans")).toBe("/community?creator=elina&tab=fans&locale=ja");
    expect(parseCommunityTab("certifications")).toBe("certifications");
    expect(parseCommunityTab("requests")).toBe("requests");
    expect(parseCommunityTab("not-a-tab")).toBe("posts");
    expect(parseCommunityTab(undefined)).toBe("posts");
  });
});

it("ranks published communities by fan count with stable ties, excluding zero and limiting five", () => {
  const creators = [
    { slug: "elina", fanCount: 10, displayOrder: 0 },
    { slug: "yuna", fanCount: 100, displayOrder: 1 },
    { slug: "a", fanCount: 100, displayOrder: 1 },
    { slug: "zero", fanCount: 0, displayOrder: 0 },
    ...[1, 2, 3, 4].map(n => ({ slug: `creator-${n}`, fanCount: n, displayOrder: n })),
  ];
  expect(hotCommunities(creators).map(c => c.slug)).toEqual(["a", "yuna", "elina", "creator-4", "creator-3"]);
  expect(hotCommunities([...creators].reverse())).toEqual(hotCommunities(creators));
  expect(creators[0].slug).toBe("elina");
  expect(hotCommunities([])).toEqual([]);
});
it("retains the media filter through creator and tab navigation", () => {
  expect(communityHref("yuna", "ja", "fans", true)).toBe("/community?creator=yuna&tab=fans&locale=ja&media=1");
});
