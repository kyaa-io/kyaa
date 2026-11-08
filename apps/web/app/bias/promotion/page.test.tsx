import { beforeEach, expect, it, vi } from "vitest";
const { listListed, findBySlug } = vi.hoisted(() => ({ listListed: vi.fn(), findBySlug: vi.fn() }));
vi.mock("@/server/content/published-content-repository", () => ({ createPublishedContentRepositoryFromEnvironment: () => ({ listListed, findBySlug }) }));
vi.mock("@/features/bias/ui/promotion-page", () => ({ PromotionPage: () => null }));
import Page from "./page";
const listed = [{ slug: "elina" }, { slug: "yuna" }];
beforeEach(() => { listListed.mockReset().mockResolvedValue(listed); findBySlug.mockReset().mockResolvedValue(null); });
it("searches listed creators only and still opens an unlisted one named by the link", async () => {
  expect((await Page({ searchParams: Promise.resolve({ locale: "ko" }) })).props).toMatchObject({ profiles: listed, unavailable: false });
  expect(findBySlug).not.toHaveBeenCalled();
  findBySlug.mockResolvedValue({ slug: "testpage" });
  const page = await Page({ searchParams: Promise.resolve({ locale: "ko", celebrity: "testpage" }) });
  expect(findBySlug).toHaveBeenCalledWith("ko", "testpage");
  expect(page.props).toMatchObject({ profiles: [...listed, { slug: "testpage" }], initialSlug: "testpage" });
});
it("marks the page unavailable when the listed read fails", async () => {
  listListed.mockRejectedValue(new Error("Unlisted creator query failed"));
  expect((await Page({ searchParams: Promise.resolve({ locale: "ko" }) })).props).toMatchObject({ profiles: [], unavailable: true });
});
