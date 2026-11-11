import { describe, expect, it } from "vitest";
import { homeBannerSchema, localizedBannerHref } from "./home-banner";
import { missionbookHomeBanner } from "./missionbook-home-banner";

describe("missionbookHomeBanner", () => {
  it.each(["ko", "en"] as const)("provides a localized guide banner for %s", locale => {
    const banner = homeBannerSchema.parse(missionbookHomeBanner(locale));
    expect(banner.title).toBe(locale === "ko" ? "덕질하는 법" : "How to earn as a fan");
    expect(localizedBannerHref(banner.href, locale)).toBe(`/guide/dukjil?locale=${locale}`);
    expect(banner.desktopImage.url).toBe("/images/guide/dukjil-hero.webp");
  });
});
