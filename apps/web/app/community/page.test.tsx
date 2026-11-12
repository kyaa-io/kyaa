import { expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NOT_FOUND"); },
  permanentRedirect: (href: string) => { throw new Error(`308:${href}`); },
}));
import CommunityPage from "./page";
it.each([
  ["certifications", "certifications"], ["board", "board"], ["posts", "board"],
  ["members", "leaderboard"], ["fans", "leaderboard"], ["requests", undefined], ["unknown", undefined],
])("permanently redirects %s to the matching fan page tab", async (tab, target) => {
  await expect(CommunityPage({ searchParams: Promise.resolve({ creator: "wena", tab, locale: "ja", tag: ["a", "b"] }) }))
    .rejects.toThrow(`308:/c/wena?locale=ja&tag=a&tag=b${target ? `&tab=${target}` : ""}`);
});
it("uses the existing group directory without a creator", async () => {
  await expect(CommunityPage({ searchParams: Promise.resolve({ locale: "ko", tab: "fans" }) })).rejects.toThrow("308:/pages/groups?locale=ko");
});
it.each(["//evil", "../wena", ["wena", "yuna"]])("rejects malformed creators", async creator => {
  await expect(CommunityPage({ searchParams: Promise.resolve({ creator }) })).rejects.toThrow("NOT_FOUND");
});
