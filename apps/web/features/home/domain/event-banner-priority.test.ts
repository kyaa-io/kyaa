import { describe, expect, it } from "vitest";
import { adminEventBanners, isAdminEventBanner } from "./event-banner-priority";
import { SIGNUP_RAFFLE_BANNER_ID } from "./signup-raffle-home-banner";
import { xMissionHomeBanner } from "./x-mission-home-banner";

const managed = [
  { id: "news", category: "announcement" },
  { id: "yuna", category: "event" },
  { id: "elina-news", category: "announcement" },
  { id: "changha", category: "event" },
  { id: "plain" },
];
const ids = (list: readonly { id: string }[]) => list.map((banner) => banner.id);

describe("adminEventBanners", () => {
  it("prioritizes Elina first, adds Changha and Yuna on Nov 20, and stops at the end of the window", () => {
    const campaigns = ["yuna", "changha", "elina"].map(id => ({ id, category: "event", href: `/${id}?locale=ko` }));
    expect(ids(adminEventBanners(campaigns, Date.parse("2026-11-19T23:59:59+09:00")))).toEqual(["elina"]);
    expect(ids(adminEventBanners(campaigns, Date.parse("2026-11-20T00:00:00+09:00")))).toEqual(["elina", "changha", "yuna"]);
    expect(ids(adminEventBanners(campaigns, Date.parse("2026-11-24T00:00:00+09:00")))).toEqual([]);
  });

  it("does not count the signup raffle or the X event as admin event banners", () => {
    expect(isAdminEventBanner({ id: SIGNUP_RAFFLE_BANNER_ID, category: "event" })).toBe(false);
    expect(isAdminEventBanner({ id: xMissionHomeBanner("ko").id, category: "event" })).toBe(false);
    expect(isAdminEventBanner({ id: "yuna", category: "event" })).toBe(true);
    expect(ids(adminEventBanners(managed))).toEqual(["yuna", "changha"]);
  });
});
