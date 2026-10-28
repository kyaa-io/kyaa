import { beforeEach, expect, it, vi } from "vitest";
const { list } = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("@/server/content/published-content-repository", () => ({ createPublishedContentRepositoryFromEnvironment: () => ({ list }) }));
vi.mock("@/features/community/ui/community-screen", () => ({ CommunityScreen: () => null }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
import CommunityPage from "./page";
const creators = [{ slug: "elina", displayOrder: 0 }, { slug: "yuna", displayOrder: 1 }];
beforeEach(() => { list.mockReset().mockResolvedValue(creators); });
it("passes the URL creator, tab, locale and media mode to the community screen", async () => {
  const page = await CommunityPage({ searchParams: Promise.resolve({ creator: "yuna", locale: "ja", tab: "posts", media: "1" }) });
  expect(page.props).toMatchObject({ creators, creator: creators[1], locale: "ja", tab: "posts", mediaOnly: true });
  expect(list).toHaveBeenCalledWith("en");
});
it("defaults ordinary community entry to the full feed", async () => {
  const page = await CommunityPage({ searchParams: Promise.resolve({ locale: "ko" }) });
  expect(page.props).toMatchObject({ creator: creators[0], tab: "posts", mediaOnly: false });
});
it("never substitutes another creator for an unavailable explicit community", async () => {
  await expect(CommunityPage({ searchParams: Promise.resolve({ creator: "unpublished", media: "1" }) })).rejects.toThrow("NOT_FOUND");
});
