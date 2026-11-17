import { describe, expect, it } from "vitest";
import { prioritizeEventBanners } from "./event-banner-priority";

const banners = [
  { id: "guide", href: "/guide" },
  { id: "x", href: "/s/x?locale=ko" },
  { id: "elina", href: "/elina" },
  { id: "changha", href: "/changha?locale=ko" },
  { id: "yuna", href: "/yuna/" },
  { id: "elina-passport", href: "/c/elina/verify?locale=ko" },
  { id: "elina-news", href: "/c/elina/notices/hello" },
  { id: "external", href: "https://example.com/elina" },
];
const ids = (at: string) => prioritizeEventBanners(banners, new Date(at)).map((banner) => banner.id);
const original = banners.map((banner) => banner.id);
const without = (id: string) => original.filter((value) => value !== id);

describe("prioritizeEventBanners", () => {
  it("puts Elina's banner first during her 11/17 window and keeps the others in order", () => {
    expect(ids("2026-11-17T00:00:00+09:00")).toEqual(["elina", ...without("elina")]);
    expect(ids("2026-11-17T23:59:59+09:00")[0]).toBe("elina");
  });

  it("puts Changha's banner first on 11/18 and during 11/22~23", () => {
    expect(ids("2026-11-18T10:00:00+09:00")).toEqual(["changha", ...without("changha")]);
    expect(ids("2026-11-22T00:00:00+09:00")[0]).toBe("changha");
    expect(ids("2026-11-23T23:59:59+09:00")[0]).toBe("changha");
  });

  it("puts Yuna's banner first on 11/19, matching despite a trailing slash", () => {
    expect(ids("2026-11-19T12:00:00+09:00")).toEqual(["yuna", ...without("yuna")]);
  });

  it("puts the Elina Passport banner (/c/elina/verify) first on 11/20~21, not her page banner", () => {
    expect(ids("2026-11-20T12:00:00+09:00")).toEqual(["elina-passport", ...without("elina-passport")]);
    expect(ids("2026-11-21T23:59:59+09:00")[0]).toBe("elina-passport");
  });

  it("returns the same list when no window is open (11/16, 11/24)", () => {
    expect(prioritizeEventBanners(banners, new Date("2026-11-16T12:00:00+09:00"))).toBe(banners);
    expect(prioritizeEventBanners(banners, new Date("2026-11-24T12:00:00+09:00"))).toBe(banners);
  });

  it("leaves the order alone when the open window has no matching banner", () => {
    const withoutElina = banners.filter((banner) => banner.id !== "elina");
    expect(prioritizeEventBanners(withoutElina, new Date("2026-11-17T12:00:00+09:00")).map((banner) => banner.id)).toEqual(withoutElina.map((banner) => banner.id));
  });
});
