import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const repositories = vi.hoisted(() => ({
  homeBanners: vi.fn(),
  findBySlug: vi.fn(),
  listSlots: vi.fn(),
  guidePhotos: vi.fn(),
  raffles: vi.fn(),
  homeNotices: vi.fn(),
  homeGallery: vi.fn(),
  homeShorts: vi.fn(),
}));

vi.mock("../server/config/env", () => ({ loadServerEnv: () => ({ SUPABASE_URL: "https://db.test", SUPABASE_SERVICE_ROLE_KEY: "secret" }) }));
vi.mock("../server/content/published-content-repository", () => ({ createPublishedContentRepositoryFromEnvironment: () => ({ findBySlug: repositories.findBySlug }) }));

vi.mock("../server/content/home-banner-repository", () => ({ createHomeBannerRepository: () => ({ list: repositories.homeBanners, listSlots: repositories.listSlots }) }));

vi.mock("../server/home-notice/home-notice-repository", () => ({ createHomeNoticeRepository: () => ({ listPublished: repositories.homeNotices }) }));

vi.mock("../server/home-gallery/home-gallery-repository", () => ({ createHomeGalleryRepository: () => ({ listPublished: repositories.homeGallery, listShorts: repositories.homeShorts }) }));

vi.mock("../server/raffle/raffle-dependencies", () => ({ createRaffleDependencies: () => ({ list: repositories.raffles }) }));

import HomePage from "./page";

describe("Home server content isolation", () => {
  beforeEach(() => {
    repositories.homeBanners.mockReset().mockResolvedValue([]);
    repositories.raffles.mockReset().mockResolvedValue({ raffles: [] });
    repositories.guidePhotos.mockReset().mockResolvedValue(undefined);
    repositories.findBySlug.mockReset().mockResolvedValue(null);
    repositories.listSlots.mockReset().mockResolvedValue({});
    repositories.homeNotices.mockReset().mockResolvedValue({ items: [], nextCursor: null });
    repositories.homeGallery.mockReset().mockResolvedValue({ items: [], nextCursor: null });
    repositories.homeShorts.mockReset().mockResolvedValue([]);
  });

  const props = (result: { props: { children: Array<{ props: Record<string, unknown> }> } }) => result.props.children[1].props as {
    queries: Record<"celebrities" | "homeBanners" | "homeSlots" | "elinaRaffles" | "homeNotices" | "homeGallery" | "homeShorts", Promise<{ status: string; value?: unknown }>>;
    [key: string]: unknown;
  };

  it("streams current raffle metadata and settles to rejected when its read fails", async () => {
    const raffles = [{ title: "Current prize", entryClosesAt: "2026-10-07T09:00:00Z" }];
    repositories.raffles.mockResolvedValue({ raffles });
    const result = await HomePage({ searchParams: Promise.resolve({ locale: "en" }) });
    expect(repositories.raffles).toHaveBeenCalledWith({ celebritySlug: "elina", locale: "en", now: expect.any(Date) });
    expect(await props(result).queries.elinaRaffles).toEqual({ status: "fulfilled", value: { raffles } });
    repositories.raffles.mockRejectedValue(new Error("unavailable"));
    const fallback = await HomePage({ searchParams: Promise.resolve({}) });
    expect(await props(fallback).queries.elinaRaffles).toEqual({ status: "rejected" });
  });

  it("reads the thin banner slot with the page and keeps the page when the slot read fails", async () => {
    repositories.listSlots.mockResolvedValue({ home_below_board: { id: "thin" } });
    const result = await HomePage({ searchParams: Promise.resolve({ locale: "en" }) });
    expect(repositories.listSlots).toHaveBeenCalledWith("en", "home");
    expect(await props(result).queries.homeSlots).toEqual({ status: "fulfilled", value: { home_below_board: { id: "thin" } } });
    repositories.listSlots.mockRejectedValue(new Error("slots unavailable"));
    const failed = await HomePage({ searchParams: Promise.resolve({}) });
    expect(await props(failed).queries.homeSlots).toEqual({ status: "rejected" });
    expect(await props(failed).queries.celebrities).toEqual({ status: "fulfilled", value: [] });
  });

  it("reads five home notices with the page and settles to rejected when the read fails", async () => {
    const page = { items: [{ id: "n1", slug: "first" }], nextCursor: null };
    repositories.homeNotices.mockResolvedValue(page);
    const result = await HomePage({ searchParams: Promise.resolve({ locale: "ja" }) });
    expect(repositories.homeNotices).toHaveBeenCalledWith("en", { limit: 5 });
    expect(await props(result).queries.homeNotices).toEqual({ status: "fulfilled", value: page });
    repositories.homeNotices.mockRejectedValue(new Error("notices unavailable"));
    const failed = await HomePage({ searchParams: Promise.resolve({}) });
    expect(await props(failed).queries.homeNotices).toEqual({ status: "rejected" });
    expect(await props(failed).queries.homeSlots).toEqual({ status: "fulfilled", value: {} });
  });

  it("returns the home shell and ready queries while the gallery is still pending", async () => {
    const empty = { items: [], nextCursor: null };
    let resolveGallery!: (value: typeof empty) => void;
    repositories.homeGallery.mockReturnValue(new Promise(resolve => { resolveGallery = resolve; }));
    let result: Awaited<ReturnType<typeof HomePage>> | undefined;
    const rendering = HomePage({ searchParams: Promise.resolve({ locale: "ko" }) }).then(value => { result = value; });
    try {
      await vi.waitFor(() => expect(result).toBeDefined());
      expect(await props(result!).queries.homeNotices).toEqual({ status: "fulfilled", value: empty });
      expect(await props(result!).queries.homeBanners).toEqual({ status: "fulfilled", value: [] });
    } finally {
      resolveGallery(empty);
      await rendering;
    }
  });

  it("reads up to 12 gallery photos with the page and settles to rejected when the read fails", async () => {
    const page = { items: [{ id: "p1" }], nextCursor: null };
    repositories.homeGallery.mockResolvedValue(page);
    const result = await HomePage({ searchParams: Promise.resolve({ locale: "ko" }) });
    expect(repositories.homeGallery).toHaveBeenCalledWith("ko", { limit: 12 });
    expect(await props(result).queries.homeGallery).toEqual({ status: "fulfilled", value: page });
    expect(repositories.homeGallery).toHaveBeenCalledTimes(1);
    repositories.homeGallery.mockRejectedValue(new Error("gallery unavailable"));
    const failed = await HomePage({ searchParams: Promise.resolve({}) });
    expect(await props(failed).queries.homeGallery).toEqual({ status: "rejected" });
    expect(await props(failed).queries.homeNotices).toEqual({ status: "fulfilled", value: { items: [], nextCursor: null } });
  });

  it("reads up to twelve LIVE YouTube videos for the Shorts shelf and settles to rejected when the read fails", async () => {
    repositories.homeShorts.mockResolvedValue([{ id: "s1" }]);
    const result = await HomePage({ searchParams: Promise.resolve({ locale: "en" }) });
    expect(repositories.homeShorts).toHaveBeenCalledWith("en", { limit: 12 });
    expect(await props(result).queries.homeShorts).toEqual({ status: "fulfilled", value: [{ id: "s1" }] });
    repositories.homeShorts.mockRejectedValue(new Error("shorts unavailable"));
    expect(await props(await HomePage({ searchParams: Promise.resolve({}) })).queries.homeShorts).toEqual({ status: "rejected" });
  });

  it("sends only Elina to the guest home, never the full creator list with unlisted creators", async () => {
    const elina = { slug: "elina", name: "Elina" };
    repositories.findBySlug.mockResolvedValue(elina);
    const result = await HomePage({ searchParams: Promise.resolve({ locale: "en" }) });
    expect(repositories.findBySlug).toHaveBeenCalledExactlyOnceWith("en", "elina");
    expect(await props(result).queries.celebrities).toEqual({ status: "fulfilled", value: [elina] });
  });

  it("no longer reads the upcoming LIVE list, the creator LIVE metadata or the unlisted list that only the retired blocks used", async () => {
    const result = await HomePage({ searchParams: Promise.resolve({}) });
    expect(Object.keys(props(result).queries).sort()).toEqual(["celebrities", "elinaRaffles", "homeBanners", "homeGallery", "homeNotices", "homeShorts", "homeSlots"]);
  });

  it("no longer reads retired event artwork for the home page", async () => {
    const result = await HomePage({ searchParams: Promise.resolve({}) });
    expect(repositories.guidePhotos).not.toHaveBeenCalled();
    expect(await props(result).queries.celebrities).toEqual({ status: "fulfilled", value: [] });
  });

  it("retains independent banners if the creator lookup fails", async () => {
    repositories.findBySlug.mockRejectedValue(new Error("creator unavailable"));
    repositories.homeBanners.mockResolvedValue([{ id: "independent" }]);
    const result = await HomePage({ searchParams: Promise.resolve({}) });
    expect(await props(result).queries.homeBanners).toEqual({ status: "fulfilled", value: [{ id: "independent" }] });
    expect(await props(result).queries.celebrities).toEqual({ status: "rejected" });
  });

  it("renders instead of throwing when every main content source fails; each section degrades on its own", async () => {
    repositories.findBySlug.mockRejectedValue(new Error("creators unavailable"));
    repositories.homeBanners.mockRejectedValue(new Error("banners unavailable"));
    const result = await HomePage({ searchParams: Promise.resolve({}) });
    const { queries } = props(result);
    expect(await Promise.all([queries.celebrities, queries.homeBanners])).toEqual([{ status: "rejected" }, { status: "rejected" }]);
  });
});

vi.mock("../server/media/guide-images", () => ({ loadGuideEventPhotos: repositories.guidePhotos }));
