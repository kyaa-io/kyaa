import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const repositories = vi.hoisted(() => ({
  listFeaturedPublished: vi.fn(),
  homeBanners: vi.fn(),
  list: vi.fn(),
  listPrimaryLives: vi.fn(),
  guidePhotos: vi.fn(),
  raffles: vi.fn(),
}));

vi.mock("../server/config/env", () => ({ loadServerEnv: () => ({ SUPABASE_URL: "https://db.test", SUPABASE_SERVICE_ROLE_KEY: "secret" }) }));
vi.mock("../server/g3/live-event-repository", () => ({ createLiveEventRepositoryFromEnvironment: () => ({ listFeaturedPublished: repositories.listFeaturedPublished }) }));
vi.mock("../server/content/published-content-repository", () => ({ createPublishedContentRepositoryFromEnvironment: () => ({ list: repositories.list, listPrimaryLives: repositories.listPrimaryLives }) }));

vi.mock("../server/content/home-banner-repository", () => ({ createHomeBannerRepository: () => ({ list: repositories.homeBanners }) }));

vi.mock("../server/raffle/raffle-dependencies", () => ({ createRaffleDependencies: () => ({ list: repositories.raffles }) }));

import HomePage from "./page";

describe("Home server content isolation", () => {
  beforeEach(() => {
    repositories.homeBanners.mockReset().mockResolvedValue([]);
    repositories.raffles.mockReset().mockResolvedValue({ raffles: [] });
    repositories.guidePhotos.mockReset().mockResolvedValue(undefined);
    repositories.listFeaturedPublished.mockReset().mockResolvedValue([]);
    repositories.list.mockReset().mockResolvedValue([]);
    repositories.listPrimaryLives.mockReset().mockResolvedValue([]);
  });

  const props = (result: { props: { children: Array<{ props: Record<string, unknown> }> } }) => result.props.children[1].props as {
    queries: Record<"featuredLives" | "celebrities" | "celebrityLives" | "homeBanners" | "elinaRaffles", Promise<{ status: string; value?: unknown }>>;
    publishedCreatorSlugs: Promise<string[] | null>;
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

  it("keeps successful creator content when LIVE loading fails", async () => {
    repositories.listFeaturedPublished.mockRejectedValue(new Error("live unavailable"));
    const result = await HomePage({ searchParams: Promise.resolve({ locale: "en" }) });
    expect(props(result)).toMatchObject({ locale: "en" });
    expect(await props(result).queries.featuredLives).toEqual({ status: "rejected" });
    expect(await props(result).queries.celebrities).toEqual({ status: "fulfilled", value: [] });
  });

  it("marks creator LIVE metadata failure separately from an empty metadata result", async () => {
    repositories.listPrimaryLives.mockRejectedValue(new Error("metadata unavailable"));
    const result = await HomePage({ searchParams: Promise.resolve({}) });
    expect(await props(result).queries.celebrityLives).toEqual({ status: "rejected" });
    expect(await props(result).queries.celebrities).toEqual({ status: "fulfilled", value: [] });
  });

  it("no longer reads retired event artwork for the home page", async () => {
    const result = await HomePage({ searchParams: Promise.resolve({}) });
    expect(repositories.guidePhotos).not.toHaveBeenCalled();
    expect(await props(result).queries.celebrities).toEqual({ status: "fulfilled", value: [] });
  });

  it("retains independent banners if live and creator lookups fail", async () => {
    repositories.listFeaturedPublished.mockRejectedValue(new Error("live unavailable"));
    repositories.list.mockRejectedValue(new Error("creator unavailable"));
    repositories.homeBanners.mockResolvedValue([{ id: "independent" }]);
    const result = await HomePage({ searchParams: Promise.resolve({}) });
    expect(await props(result).queries.homeBanners).toEqual({ status: "fulfilled", value: [{ id: "independent" }] });
    expect(await props(result).queries.featuredLives).toEqual({ status: "rejected" });
    expect(await props(result).queries.celebrities).toEqual({ status: "rejected" });
    expect(await props(result).publishedCreatorSlugs).toBeNull();
  });

  it.each([
    [{}, undefined, "all"],
    [{ role: "all" }, false, "all"],
    [{ role: "creator" }, false, "creator"],
    [{ owned: "1" }, true, "all"],
    [{ owned: "0" }, false, "all"],
  ] as const)("distinguishes automatic defaults from explicit URL filters %j", async (query, initialOwnedOnly, initialRole) => {
    const result = await HomePage({ searchParams: Promise.resolve(query) });
    expect(result.props.children[1].props).toMatchObject({ initialOwnedOnly, initialRole });
  });

  it("renders instead of throwing when every main content source fails; each section degrades on its own", async () => {
    repositories.listFeaturedPublished.mockRejectedValue(new Error("live unavailable"));
    repositories.list.mockRejectedValue(new Error("creators unavailable"));
    repositories.homeBanners.mockRejectedValue(new Error("banners unavailable"));
    const result = await HomePage({ searchParams: Promise.resolve({}) });
    const { queries } = props(result);
    expect(await Promise.all([queries.featuredLives, queries.celebrities, queries.homeBanners])).toEqual([{ status: "rejected" }, { status: "rejected" }, { status: "rejected" }]);
  });
});

vi.mock("../server/media/guide-images", () => ({ loadGuideEventPhotos: repositories.guidePhotos }));
