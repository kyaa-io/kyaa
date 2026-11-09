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
  // The twelve curated dev photos, in rank order (Elina, Changha, Yuna, Elina, Elina, then the rest).
  const mixed = [[3024, 4032], [2075, 2766], [3072, 4096], [3024, 4032], [2730, 1820], [1440, 1920], [2560, 2034], [2048, 1536], [3024, 4032], [1537, 2048], [544, 544], [1439, 1440]]
    .map(([width, height], i) => photo(i, width!, height!));
  it("places every photo whole at its own ratio and levels the column bottoms to within a fraction of a photo", () => {
    for (const layout of Object.values(homeGalleryLayouts)) {
      const { columns, placed, spread } = allocateGalleryColumns(mixed, layout);
      expect(placed).toBe(mixed.length);
      expect(columns.flat().map(item => item.id).sort()).toEqual(mixed.map(item => item.id).sort());
      expect(columns).toHaveLength(layout.columns);
      expect(spread).toBeLessThan(layout.columns === 2 ? 0.05 : 0.13);
    }
  });
  it("keeps the given order inside a column so the first photos stay on top", () => {
    const order = mixed.map(item => item.id);
    for (const layout of Object.values(homeGalleryLayouts)) {
      for (const column of allocateGalleryColumns(mixed, layout).columns) {
        const positions = column.map(item => order.indexOf(item.id));
        expect(positions).toEqual([...positions].sort((a, b) => a - b));
      }
    }
  });
  it("starts with the shortest column and uses fewer columns than the layout when there are fewer photos", () => {
    const { columns } = allocateGalleryColumns([photo(1, 1000, 1000), photo(2, 1000, 3000), photo(3, 1000, 500)], homeGalleryLayouts.mobile);
    expect(columns.map(column => column.map(item => item.id))).toEqual([["p1", "p3"], ["p2"]]);
    expect(allocateGalleryColumns([photo(1, 1000, 1000)], homeGalleryLayouts.desktop).columns).toHaveLength(1);
    expect(allocateGalleryColumns([], homeGalleryLayouts.desktop)).toEqual({ columns: [], placed: 0, spread: 0 });
  });
});

describe("home gallery block", () => {
  it("shows the empty text only when the read found nothing", () => {
    const { container } = render(<HomeGallery locale="ko" photos={[]} hasMore={false} shorts={[]} />);
    expect(container.querySelectorAll('[data-row="photo-placeholder"]')).toHaveLength(8);
    expect(container.querySelectorAll('[data-row="short-placeholder"]')).toHaveLength(4);
    expect(screen.getByText("아직 사진 없음")).toBeInTheDocument();
    expect(screen.getByText("아직 숏츠 없음")).toBeInTheDocument();
  });
  it.each(["loading", "error"] as const)("keeps the same placeholders without any empty text while %s (a failure is never shown as zero)", (state) => {
    const { container } = render(<HomeGallery locale="ko" photos={state} hasMore={false} shorts={state} />);
    expect(container.querySelectorAll('[data-row="photo-placeholder"]')).toHaveLength(8);
    expect(container.querySelectorAll('[data-row="short-placeholder"]')).toHaveLength(4);
    expect(container.querySelector(`[data-home-state="${state}"]`)).not.toBeNull();
    expect(screen.queryByText("아직 사진 없음")).not.toBeInTheDocument();
    expect(screen.queryByText("아직 숏츠 없음")).not.toBeInTheDocument();
  });
  it("a failed photo read beside working Shorts keeps only the photo area pending", () => {
    render(<HomeGallery locale="ko" photos="error" hasMore={false} shorts={[]} />);
    expect(screen.queryByText("아직 사진 없음")).not.toBeInTheDocument();
    expect(screen.getByText("아직 숏츠 없음")).toBeInTheDocument();
  });
  it("shows the real photos at their own ratio with the source alt, links official photos to the notice, with no pink tile among them", () => {
    const { container } = render(<HomeGallery locale="ko" photos={photos} hasMore={false} shorts={[]} />);
    for (const layout of ["mobile", "desktop"]) expect(container.querySelector(`[data-gallery-layout="${layout}"]`)!.querySelectorAll('[data-row="photo"]')).toHaveLength(4);
    expect(container.querySelectorAll('[data-gallery-layout] [data-row="photo-placeholder"]')).toHaveLength(0);
    const official = screen.getAllByRole("img", { name: "공식 게시물 1" })[0]!;
    expect(official).toHaveAttribute("width", "1080");
    expect(official).toHaveAttribute("height", "1350");
    expect(official.closest("a")).toHaveAttribute("href", "/c/r8data-photo/notices/r8-ok1");
    expect(screen.getAllByRole("img", { name: "R8 사진 무대 사진" })[0]!.closest("a")).toBeNull();
    expect(screen.queryByText("아직 사진 없음")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /전체 보기/ })).not.toBeInTheDocument();
  });
  it("adds the view-all link when more photos exist", () => {
    render(<HomeGallery locale="en" photos={photos} hasMore shorts={[]} />);
    expect(screen.getByRole("link", { name: /View all/ })).toHaveAttribute("href", "/gallery?locale=en");
  });
  it("shows the LIVE YouTube videos with their LIVE titles and YouTube thumbnails, and fills the rest of the shelf", () => {
    const { container } = render(<HomeGallery locale="ko" photos={[]} hasMore={false} shorts={shorts} />);
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
