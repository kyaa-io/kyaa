import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../server/signup-event/home-scale", () => ({ readHomeScale: async () => ({ members: 0, today: 0, entrants: null, asOf: "2026-11-27T00:00:00Z" }) }));
vi.mock("server-only", () => ({}));

const repositories = vi.hoisted(() => ({
  homeBanners: vi.fn(),
  listSlots: vi.fn(),
  raffles: vi.fn(),
  homeNotices: vi.fn(),
  homeGallery: vi.fn(),
  homeShorts: vi.fn(),
}));

vi.mock("../server/config/env", () => ({ loadServerEnv: () => ({ SUPABASE_URL: "https://db.test", SUPABASE_SERVICE_ROLE_KEY: "secret" }) }));

vi.mock("../server/content/home-banner-repository", () => ({ createHomeBannerRepository: () => ({ list: repositories.homeBanners, listSlots: repositories.listSlots }) }));

vi.mock("../server/home-notice/home-notice-repository", () => ({ createHomeNoticeRepository: () => ({ listPublished: repositories.homeNotices }) }));

vi.mock("../server/home-gallery/home-gallery-repository", () => ({ createHomeGalleryRepository: () => ({ listPublishedPool: repositories.homeGallery, listShorts: repositories.homeShorts }) }));

const requestCookies = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => requestCookies.has(name) ? { name, value: requestCookies.get(name) } : undefined }) }));

import HomePage from "./page";

describe("Home server content isolation", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    repositories.homeBanners.mockReset().mockResolvedValue([]);
    repositories.listSlots.mockReset().mockResolvedValue({});
    repositories.homeNotices.mockReset().mockResolvedValue({ items: [], nextCursor: null });
    repositories.homeGallery.mockReset().mockResolvedValue({ items: [], nextCursor: null });
    repositories.homeShorts.mockReset().mockResolvedValue([]);
    requestCookies.clear();
  });

  const props = (result: { props: { children: Array<{ props: Record<string, unknown> }> } }) => result.props.children[1].props as {
    queries: Record<"homeBanners" | "homeSlots" | "homeNotices" | "homeGallery" | "homeShorts" | "scale", Promise<{ status: string; value?: unknown }>>;
    [key: string]: unknown;
  };

  it("keeps the first-steps banner until this browser finished the three steps", async () => {
    expect(props(await HomePage({ searchParams: Promise.resolve({}) })).firstSteps).toBe(true);
    requestCookies.set("kyaa_first_steps", "other");
    expect(props(await HomePage({ searchParams: Promise.resolve({}) })).firstSteps).toBe(true);
    requestCookies.set("kyaa_first_steps", "done");
    expect(props(await HomePage({ searchParams: Promise.resolve({}) })).firstSteps).toBe(false);
  });

  it("keeps the admin raffle banner in its admin place while the raffle is open, and leaves it out while the raffle flag is off", async () => {
    const raffle = { id: "cms-raffle", href: "/s/raffle?utm_source=home" };
    const other = { id: "other", href: "/events" };
    repositories.homeBanners.mockResolvedValue([raffle, other]);
    vi.stubEnv("KYAA_FEATURE_SIGNUP_RAFFLE", "false");
    const off = props(await HomePage({ searchParams: Promise.resolve({}) }));
    expect(await off.queries.homeBanners).toEqual({ status: "fulfilled", value: [other] });
    vi.stubEnv("KYAA_FEATURE_SIGNUP_RAFFLE", "true");
    const on = props(await HomePage({ searchParams: Promise.resolve({}) }));
    expect(await on.queries.homeBanners).toEqual({ status: "fulfilled", value: [raffle, other] });
  });

  it("reads the thin banner slot with the page and keeps the page when the slot read fails", async () => {
    repositories.listSlots.mockResolvedValue({ home_below_board: { id: "thin" } });
    const result = await HomePage({ searchParams: Promise.resolve({ locale: "en" }) });
    expect(repositories.listSlots).toHaveBeenCalledWith("en", "home");
    expect(await props(result).queries.homeSlots).toEqual({ status: "fulfilled", value: { home_below_board: { id: "thin" } } });
    repositories.listSlots.mockRejectedValue(new Error("slots unavailable"));
    const failed = await HomePage({ searchParams: Promise.resolve({}) });
    expect(await props(failed).queries.homeSlots).toEqual({ status: "rejected" });
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

  it("reads up to 24 gallery photos (the home block shows the 12 most varied) with the page and settles to rejected when the read fails", async () => {
    const page = { items: [{ id: "p1" }], nextCursor: null };
    repositories.homeGallery.mockResolvedValue(page);
    const result = await HomePage({ searchParams: Promise.resolve({ locale: "ko" }) });
    expect(repositories.homeGallery).toHaveBeenCalledWith("ko", { pages: 3 });
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

  it("no longer reads the upcoming LIVE list, the retired Elina card data or the unlisted creator list", async () => {
    const result = await HomePage({ searchParams: Promise.resolve({}) });
    expect(Object.keys(props(result).queries).sort()).toEqual(["homeBanners", "homeGallery", "homeNotices", "homeShorts", "homeSlots", "scale"]);
  });
});
