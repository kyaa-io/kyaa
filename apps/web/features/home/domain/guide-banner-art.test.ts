import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bannerFixture } from "../../../e2e/banner-local/fixture";
import { homeBannerSchema } from "./home-banner";
import { isGuideArtBanner, withGuideBannerArt } from "./guide-banner-art";

const guide = (href: string) => homeBannerSchema.parse({ ...bannerFixture, category: "guide", href, title: "[가안] 찐팬 되는 법", alt: "[가안]" });

describe("approved guide banner art", () => {
  it.each(["/guide/jjinfan", "/guide/dukjil?locale=ko"])("replaces the draft picture and copy of %s in both languages", href => {
    for (const locale of ["ko", "en"] as const) {
      const banner = withGuideBannerArt(guide(href), locale);
      expect(homeBannerSchema.safeParse(banner).success).toBe(true);
      expect(JSON.stringify(banner)).not.toContain("가안");
      expect(banner.desktopImage).toMatchObject({ width: 1774, height: 887, mimeType: "image/webp" });
      expect(banner.mobileImage).toMatchObject({ width: 1374, height: 1145, mimeType: "image/webp" });
      for (const image of [banner.desktopImage, banner.mobileImage!]) expect(existsSync(join(process.cwd(), "public", image.url))).toBe(true);
    }
    expect(withGuideBannerArt(guide(href), "ko").href).toBe(href);
  });
  it("keeps the picture of an unrelated or non-guide banner", () => {
    const other = homeBannerSchema.parse({ ...bannerFixture, category: "guide", href: "/guide/other" });
    expect(withGuideBannerArt(other, "ko")).toBe(other);
    const announcement = homeBannerSchema.parse({ ...bannerFixture, category: "announcement", href: "/guide/jjinfan" });
    expect(withGuideBannerArt(announcement, "en")).toBe(announcement);
    expect(isGuideArtBanner(announcement)).toBe(false);
  });
  it("uses the mission book condition in the banner copy", () => {
    expect(withGuideBannerArt(guide("/guide/jjinfan"), "ko")).toMatchObject({ title: "찐팬 되는 법", description: "미션북 9칸을 채우면 찐팬 도장을 받아요" });
  });
});
