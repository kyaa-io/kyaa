import { describe, expect, it } from "vitest";
import { homeBannerSchema, localizedBannerHref } from "./home-banner";
import { missionbookHomeBanner } from "./missionbook-home-banner";

describe("missionbookHomeBanner", () => {
  it.each(["ko", "en"] as const)("provides a localized guide banner for %s", locale => {
    const banner = homeBannerSchema.parse(missionbookHomeBanner(locale));
    expect(banner.title).toBe(locale === "ko" ? "덕질미션북" : "Fan mission book");
    expect(localizedBannerHref(banner.href, locale)).toBe(`/follow?locale=${locale}`);
    // v2 picture under new file names (cached pages must not keep the old one); wide for 768+, square for the phone slot.
    expect(banner.desktopImage.url).toBe("/images/guide/missionbook-v2-wide.webp");
    expect(banner.mobileImage?.url).toBe("/images/guide/missionbook-v2-square.webp");
    expect(banner.mobileImage?.width).toBe(banner.mobileImage?.height);
  });
});
