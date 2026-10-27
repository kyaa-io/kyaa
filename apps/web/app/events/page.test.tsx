import { beforeEach, describe, expect, it, vi } from "vitest";

const { listBanners, listCelebrities, listRaffles } = vi.hoisted(() => ({
  listBanners: vi.fn(), listCelebrities: vi.fn(), listRaffles: vi.fn(),
}));
vi.mock("@/server/config/env", () => ({ loadServerEnv: () => ({ SUPABASE_URL: "https://test.invalid", SUPABASE_SERVICE_ROLE_KEY: "test" }) }));
vi.mock("@/server/content/home-banner-repository", () => ({ createHomeBannerRepository: () => ({ list: listBanners }) }));
vi.mock("@/server/content/published-content-repository", () => ({ createPublishedContentRepositoryFromEnvironment: () => ({ list: listCelebrities }) }));
vi.mock("@/server/raffle/raffle-dependencies", () => ({ createRaffleDependencies: () => ({ list: listRaffles }) }));
vi.mock("@/features/home/ui/events-catalog-screen", () => ({ EventsCatalogScreen: () => null }));

import EventsPage from "./page";
import { gggiHomeBanner } from "@/features/home/domain/gggi-home-banner";

describe("events page public content", () => {
  beforeEach(() => {
    listBanners.mockResolvedValue([{ id: "banner" }]);
    listCelebrities.mockResolvedValue([{ slug: "elina" }]);
    listRaffles.mockResolvedValue({ raffles: [{ id: "raffle", status: "closed" }] });
  });

  it("preserves the app locale while reading the existing public content locale", async () => {
    const page = await EventsPage({ searchParams: Promise.resolve({ locale: "ja" }) });
    expect(page.props).toMatchObject({ locale: "ja", homeBanners: [gggiHomeBanner("ja"), { id: "banner" }], elina: { slug: "elina" }, contentUnavailable: false });
    expect(listBanners).toHaveBeenCalledWith("en");
    expect(listCelebrities).toHaveBeenCalledWith("en");
    expect(listRaffles).toHaveBeenCalledWith({ celebritySlug: "elina", locale: "en", now: expect.any(Date) });
  });

  it("does not turn an unavailable raffle read into an open campaign", async () => {
    listRaffles.mockRejectedValue(new Error("unavailable"));
    const page = await EventsPage({ searchParams: Promise.resolve({ locale: "ko" }) });
    expect(page.props).toMatchObject({ elina: undefined, elinaRaffles: [], showElinaCampaign: false, contentUnavailable: true });
    expect(page.props.homeBanners).toEqual([gggiHomeBanner("ko"), { id: "banner" }]);
  });

  it("keeps available campaign content when banners fail", async () => {
    listBanners.mockRejectedValue(new Error("unavailable"));
    const page = await EventsPage({ searchParams: Promise.resolve({}) });
    expect(page.props).toMatchObject({ homeBanners: [gggiHomeBanner("ko")], elina: { slug: "elina" }, contentUnavailable: true });
  });

  it("retains the home campaign without a creator portrait", async () => {
    listCelebrities.mockResolvedValue([]);
    const page = await EventsPage({ searchParams: Promise.resolve({}) });
    expect(page.props).toMatchObject({ elina: undefined, showElinaCampaign: true, contentUnavailable: false });
  });

  it("paginates banners and the final campaign as one ordered list", async () => {
    listBanners.mockResolvedValue(Array.from({ length: 20 }, (_, index) => ({ id: `banner-${index}` })));
    const first = await EventsPage({ searchParams: Promise.resolve({ locale: "ja" }) });
    expect(first.props.homeBanners.map((banner: { id: string }) => banner.id)).toEqual([gggiHomeBanner("ja").id, ...Array.from({ length: 9 }, (_, index) => `banner-${index}`)]);
    expect(first.props.showElinaCampaign).toBe(false);
    expect(first.props.pagination.props).toMatchObject({ locale: "ja", page: 1, pageCount: 3 });

    const second = await EventsPage({ searchParams: Promise.resolve({ locale: "ja", page: "2" }) });
    expect(second.props.homeBanners.map((banner: { id: string }) => banner.id)).toEqual(Array.from({ length: 10 }, (_, index) => `banner-${index + 9}`));
    expect(second.props.showElinaCampaign).toBe(false);

    const last = await EventsPage({ searchParams: Promise.resolve({ locale: "ja", page: "3" }) });
    expect(last.props.homeBanners).toEqual([{ id: "banner-19" }]);
    expect(last.props.showElinaCampaign).toBe(true);
    expect(last.props.pagination.props).toMatchObject({ page: 3, pageCount: 3 });
  });

  it("keeps the final campaign when it is the only item on the last page", async () => {
    listBanners.mockResolvedValue(Array.from({ length: 9 }, (_, index) => ({ id: `banner-${index}` })));
    const page = await EventsPage({ searchParams: Promise.resolve({ page: "2" }) });
    expect(page.props).toMatchObject({ homeBanners: [], showElinaCampaign: true });
    expect(page.props.pagination.props).toMatchObject({ page: 2, pageCount: 2 });
  });

  it.each(["0", "-1", "1.5", "abc", "9007199254740992", ["2", "3"]])("defaults an invalid page query to the first page: %s", async (query) => {
    const page = await EventsPage({ searchParams: Promise.resolve({ page: query }) });
    expect(page.props.pagination.props).toMatchObject({ page: 1 });
  });

  it("clamps an out-of-range page to available content after partial failures", async () => {
    listRaffles.mockRejectedValue(new Error("unavailable"));
    const page = await EventsPage({ searchParams: Promise.resolve({ page: "999" }) });
    expect(page.props).toMatchObject({ showElinaCampaign: false, contentUnavailable: true });
    expect(page.props.homeBanners).toHaveLength(2);
    expect(page.props.pagination.props).toMatchObject({ page: 1, pageCount: 1 });
  });
});
