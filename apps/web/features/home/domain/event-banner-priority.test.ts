import { describe, expect, it } from "vitest";
import { adminEventBanners, isAdminEventBanner, orderHomeBanners } from "./event-banner-priority";
import { SIGNUP_RAFFLE_BANNER_ID } from "./signup-raffle-home-banner";
import { xMissionHomeBanner } from "./x-mission-home-banner";

const pinned = [
  { id: "missionbook", category: "guide" },
  { id: SIGNUP_RAFFLE_BANNER_ID, category: "event" },
  { id: xMissionHomeBanner("ko").id, category: "event" },
  { id: "gggi" },
];
const managed = [
  { id: "news", category: "announcement" },
  { id: "yuna", category: "event" },
  { id: "elina-news", category: "announcement" },
  { id: "changha", category: "event" },
  { id: "plain" },
];
const ids = (list: readonly { id: string }[]) => list.map((banner) => banner.id);

describe("orderHomeBanners", () => {
  it("puts the admin 'event' banners first in admin order, then the code-pinned banners, then the other admin banners", () => {
    expect(ids(orderHomeBanners(pinned, managed))).toEqual(["yuna", "changha", ...ids(pinned), "news", "elina-news", "plain"]);
  });

  it("prioritizes Elina first, adds Changha and Yuna on Nov 20, and stops at the end of the window", () => {
    const campaigns = ["yuna", "changha", "elina"].map(id => ({ id, category: "event", href: `/${id}?locale=ko` }));
    expect(ids(adminEventBanners(campaigns, Date.parse("2026-11-19T23:59:59+09:00")))).toEqual(["elina"]);
    expect(ids(adminEventBanners(campaigns, Date.parse("2026-11-20T00:00:00+09:00")))).toEqual(["elina", "changha", "yuna"]);
    expect(ids(adminEventBanners(campaigns, Date.parse("2026-11-24T00:00:00+09:00")))).toEqual([]);
  });

  it("keeps pinned first when no admin banner is an event (code-pinned event banners never jump ahead)", () => {
    expect(ids(orderHomeBanners(pinned, managed.filter((banner) => banner.category !== "event")))).toEqual([...ids(pinned), "news", "elina-news", "plain"]);
    expect(ids(orderHomeBanners(pinned, []))).toEqual(ids(pinned));
  });

  it("does not count the signup raffle or the X event as admin event banners", () => {
    expect(isAdminEventBanner({ id: SIGNUP_RAFFLE_BANNER_ID, category: "event" })).toBe(false);
    expect(isAdminEventBanner({ id: xMissionHomeBanner("ko").id, category: "event" })).toBe(false);
    expect(isAdminEventBanner({ id: "yuna", category: "event" })).toBe(true);
    expect(ids(adminEventBanners(managed))).toEqual(["yuna", "changha"]);
  });
});
