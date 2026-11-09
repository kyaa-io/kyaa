import { render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { APP_LOCALES } from "@/i18n/locales";
import { HomeGallery, HomeGalleryPlaceholder } from "./home-placeholder-blocks";
import type { HomeGalleryPhoto } from "@/features/home/domain/home-gallery";

const photos: HomeGalleryPhoto[] = [[3024, 4032], [2075, 2766], [3072, 4096], [3024, 4032], [2730, 1820], [1440, 1920], [2560, 2034], [2048, 1536], [3024, 4032], [1537, 2048], [544, 544], [1439, 1440]].map(([width, height], i) => ({
  id: `reservation-${i}`, source: "cms_upload", alt: "Source photo", creator: { slug: "example", name: "Example" },
  image: { url: "https://example.com/photo.jpg", width: width!, height: height! },
}));

describe("home-placeholder-blocks", () => {
  it.each(APP_LOCALES)("reserves the final photo geometry in %s without loading the images twice", locale => {
    const pending = render(<HomeGalleryPlaceholder locale={locale} expectedPhotos={photos} />);
    const shapes = ["mobile", "desktop"].map(layout => [...pending.container.querySelector(`[data-gallery-reservation="${layout}"]`)!.children].map(column => [...column.children].map(tile => (tile as HTMLElement).style.getPropertyValue("--gallery-photo-ratio"))));
    expect(pending.container.querySelector("img")).toBeNull();
    pending.unmount();
    const loaded = render(<HomeGallery locale={locale} photos={photos} hasMore={false} shorts={[]} />);
    for (const [index, layout] of ["mobile", "desktop"].entries()) {
      const actual = [...loaded.container.querySelector(`[data-gallery-layout="${layout}"]`)!.children].map(column => [...column.querySelectorAll("img")].map(img => `${img.getAttribute("width")} / ${img.getAttribute("height")}`));
      expect(shapes[index]).toEqual(actual);
    }
  });
  it("uses white and line tokens for gallery and Shorts fallbacks, including error and empty", () => {
    const css = readFileSync(resolve(__dirname, "home-placeholder-blocks.module.css"), "utf8");
    for (const name of ["tile", "card"]) {
      const rule = css.match(new RegExp(`\\.${name} \\{([^}]+)\\}`))![1]!;
      expect(rule).toContain("background: var(--color-surface)");
      expect(rule).toContain("var(--color-line)");
      expect(rule).not.toContain("--color-accent-soft");
    }
  });
});
