import { expect, it } from "vitest";
import { communityHref } from "./navigation";
it.each([["posts", "board"], ["fans", "leaderboard"], ["certifications", "certifications"], ["requests", "home"]] as const)("links %s directly to the fan page", (tab, target) => {
  expect(communityHref("wena", "ja", tab)).toBe(`/c/wena?tab=${target}&locale=ja`);
});
it("preserves media filtering", () => {
  expect(communityHref("wena", "ko", "posts", true)).toBe("/c/wena?tab=board&locale=ko&media=1");
});
