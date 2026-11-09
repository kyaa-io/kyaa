import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import page from "@/server/home-gallery/fixtures/read_public_home_gallery_photos.json";
import shortsRows from "@/server/home-gallery/fixtures/read_public_home_shorts.json";
import { homeShortsSchema, type HomeGalleryPhoto } from "@/features/home/domain/home-gallery";
import { allocateGalleryColumns, homeGalleryLayouts } from "./home-gallery-layout";
import { HomeGalleryScreen } from "./home-gallery-page";
import { HomeGallery } from "./home-placeholder-blocks";

// Real SQL rows (supabase/tests/home_gallery_shorts.sh): two CMS image-role photos and two collected official SNS photos; three LIVE YouTube videos.
const photos = page.items as HomeGalleryPhoto[];
const shorts = homeShortsSchema.parse(shortsRows);
const photo = (id: number, width: number, height: number): HomeGalleryPhoto => ({ ...photos[2]!, id: `p${id}`, image: { ...photos[2]!.image, width, height } });

describe("gallery column allocation", () => {
  it("never places more than a column holds and keeps every placed photo whole", () => {
    const many = Array.from({ length: 12 }, (_, i) => photo(i, 1080, i % 3 === 0 ? 1350 : 1080));
    for (const layout of Object.values(homeGalleryLayouts)) {
      const { columns, placed } = allocateGalleryColumns(many, layout);
      for (const column of columns) {
        const used = column.reduce((sum, item, index) => sum + item.image.height / item.image.width + (index ? layout.gap : 0), 0);
        expect(used).toBeLessThanOrEqual(layout.budget);
      }
      expect(placed).toBeLessThan(many.length);
      expect(columns.flat()).toHaveLength(placed);
    }
  });
  it("fills the shortest column first and skips a photo too tall for every column", () => {
    const { columns } = allocateGalleryColumns([photo(1, 1000, 1000), photo(2, 1000, 3000), photo(3, 1000, 500)], homeGalleryLayouts.mobile);
    expect(columns.map(column => column.map(item => item.id))).toEqual([["p1"], ["p3"]]);
  });
});

describe("home gallery block", () => {
  it("keeps the existing empty states only for no data or a failed read", () => {
    for (const value of [null, []]) {
      const { container, unmount } = render(<HomeGallery locale="ko" photos={value} hasMore={false} shorts={value} />);
      expect(container.querySelectorAll('[data-row="photo-placeholder"]')).toHaveLength(8);
      expect(container.querySelectorAll('[data-row="short-placeholder"]')).toHaveLength(4);
      expect(screen.getByText("아직 사진 없음")).toBeInTheDocument();
      expect(screen.getByText("아직 숏츠 없음")).toBeInTheDocument();
      unmount();
    }
  });
  it("shows the real photos at their own ratio with the source alt, links official photos to the notice, and fills the rest", () => {
    const { container } = render(<HomeGallery locale="ko" photos={photos} hasMore={false} shorts={null} />);
    for (const layout of ["mobile", "desktop"]) expect(container.querySelector(`[data-gallery-layout="${layout}"]`)!.querySelectorAll('[data-row="photo"]')).toHaveLength(4);
    expect(container.querySelector('[data-gallery-layout="mobile"]')!.querySelectorAll('[data-row="photo-placeholder"]')).toHaveLength(2);
    const official = screen.getAllByRole("img", { name: "공식 게시물 1" })[0]!;
    expect(official).toHaveAttribute("width", "1080");
    expect(official).toHaveAttribute("height", "1350");
    expect(official.closest("a")).toHaveAttribute("href", "/c/r8data-photo/notices/r8-ok1");
    expect(screen.getAllByRole("img", { name: "R8 사진 무대 사진" })[0]!.closest("a")).toBeNull();
    expect(screen.queryByText("아직 사진 없음")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /전체 보기/ })).not.toBeInTheDocument();
  });
  it("adds the view-all link when more photos exist", () => {
    render(<HomeGallery locale="en" photos={photos} hasMore shorts={null} />);
    expect(screen.getByRole("link", { name: /View all/ })).toHaveAttribute("href", "/gallery?locale=en");
  });
  it("shows the LIVE YouTube videos with their LIVE titles and YouTube thumbnails, and fills the rest of the shelf", () => {
    const { container } = render(<HomeGallery locale="ko" photos={null} hasMore={false} shorts={shorts} />);
    expect(container.querySelectorAll('[data-row="short"]')).toHaveLength(3);
    expect(container.querySelectorAll('[data-row="short-placeholder"]')).toHaveLength(1);
    const first = screen.getByRole("link", { name: /R8 라이브 r8-live-watch/ });
    expect(first).toHaveAttribute("href", "/live/r8-live-watch");
    expect(first.querySelector("img")!.getAttribute("src")).toContain("R8shortsAA1");
    expect(screen.queryByText("아직 숏츠 없음")).not.toBeInTheDocument();
  });
  it("never crops gallery photos with object-fit cover (only the 16:9 video card trims YouTube letterboxing)", () => {
    const css = readFileSync(resolve(__dirname, "home-placeholder-blocks.module.css"), "utf8").split("\n").filter(line => /object-fit:\s*cover/.test(line));
    expect(css).toEqual([".card > img { display: block; width: 100%; height: 100%; object-fit: cover; }"]);
    expect(readFileSync(resolve(__dirname, "home-gallery-page.module.css"), "utf8")).not.toMatch(/object-fit:\s*cover/);
  });
});

describe("/gallery", () => {
  it("lists every photo with its creator, one empty row without data, and a more link", () => {
    const { unmount } = render(<HomeGalleryScreen locale="ko" items={[]} nextCursor={null} />);
    expect(screen.getByText("아직 사진 없음")).toBeInTheDocument();
    unmount();
    render(<HomeGalleryScreen locale="ko" items={photos} nextCursor="abc" />);
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByRole("link", { name: /더 보기/ })).toHaveAttribute("href", "/gallery?locale=ko&cursor=abc");
  });
});
