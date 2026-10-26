import { describe, expect, it } from "vitest";
import { APP_LOCALES } from "@/i18n/locales";
import { homeBannerSchema, localizedBannerHref } from "./home-banner";
import { gggiHomeBanner } from "./gggi-home-banner";
describe("GGGI home campaign", () => {
  it.each(APP_LOCALES)("uses valid artwork and a localized entry link in %s", locale => {
    const banner = homeBannerSchema.parse(gggiHomeBanner(locale));
    expect(banner.desktopImage.width / banner.desktopImage.height).toBe(1.5);
    expect(localizedBannerHref(banner.href, locale)).toBe(`/gggi?locale=${locale}#gggi-event`);
  });
});
