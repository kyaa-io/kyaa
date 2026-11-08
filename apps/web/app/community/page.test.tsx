import { beforeEach, expect, it, vi } from "vitest";
const { listListed, findBySlug } = vi.hoisted(() => ({ listListed: vi.fn(), findBySlug: vi.fn() }));
vi.mock("@/server/content/published-content-repository", () => ({ createPublishedContentRepositoryFromEnvironment: () => ({ listListed, findBySlug }) }));
vi.mock("@/features/community/ui/community-screen", () => ({ CommunityScreen: () => null }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
import CommunityPage from "./page";
const creators = [{ slug: "elina", displayOrder: 0 }, { slug: "yuna", displayOrder: 1 }];
beforeEach(() => { listListed.mockReset().mockResolvedValue(creators); findBySlug.mockReset().mockResolvedValue(null); });
it("passes the URL creator, tab, locale and media mode to the community screen", async () => {
  const page = await CommunityPage({ searchParams: Promise.resolve({ creator: "yuna", locale: "ja", tab: "posts", media: "1" }) });
  expect(page.props).toMatchObject({ creators, creator: creators[1], locale: "ja", tab: "posts", mediaOnly: true });
  expect(listListed).toHaveBeenCalledWith("en");
  expect(findBySlug).not.toHaveBeenCalled();
});
it("defaults ordinary community entry to the full feed", async () => {
  const page = await CommunityPage({ searchParams: Promise.resolve({ locale: "ko" }) });
  expect(page.props).toMatchObject({ creator: creators[0], tab: "posts", mediaOnly: false });
});
it("never substitutes another creator for an unavailable explicit community", async () => {
  await expect(CommunityPage({ searchParams: Promise.resolve({ creator: "unpublished", media: "1" }) })).rejects.toThrow("NOT_FOUND");
});
it("keeps unlisted creators out of the default pick and menu but opens one by its own link", async () => {
  const unlisted = { slug: "test-page", displayOrder: -1 };
  const fallback = await CommunityPage({ searchParams: Promise.resolve({ locale: "ko" }) });
  expect(fallback.props).toMatchObject({ creators, creator: creators[0] });
  findBySlug.mockResolvedValue(unlisted);
  const page = await CommunityPage({ searchParams: Promise.resolve({ creator: "test-page", locale: "ko" }) });
  expect(findBySlug).toHaveBeenCalledWith("ko", "test-page");
  expect(page.props).toMatchObject({ creators: [...creators, unlisted], creator: unlisted });
});
