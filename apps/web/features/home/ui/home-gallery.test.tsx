import { fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import page from "@/server/home-gallery/fixtures/read_public_home_gallery_photos.json";
import relativePage from "@/server/home-gallery/fixtures/read_public_home_gallery_photos_relative.json";
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
  it("keeps every relative photo and preserves its natural ratio without shared image caching", () => {
    const relative = relativePage.items as HomeGalleryPhoto[];
    const portrait = relative.filter(item => item.image.height > item.image.width);
    const landscape = relative.filter(item => item.image.width > item.image.height);
    expect(relative).toHaveLength(9);
    expect(landscape).toHaveLength(1);
    for (const layout of Object.values(homeGalleryLayouts)) {
      const squares = Array.from({ length: layout.columns }, (_, i) => photo(i, 1000, 1000));
      const before = allocateGalleryColumns(squares, layout);
      const after = allocateGalleryColumns([...squares, ...landscape], layout);
      expect(after.placed).toBe(before.placed + 1);
      const portraitsFirst = allocateGalleryColumns([...portrait, ...landscape], layout);
      expect(portraitsFirst.placed).toBe(relative.length);
      expect(portraitsFirst.columns.flat().map(item => item.id).sort()).toEqual(relative.map(item => item.id).sort());
    }
    const { container } = render(<HomeGallery locale="ko" photos={[...landscape, ...portrait]} hasMore={false} shorts={[]} />);
    for (const layout of ["mobile", "desktop"]) {
      const img = container.querySelector(`[data-gallery-layout="${layout}"] img[src="${landscape[0]!.image.url}"]`);
      expect(img).toHaveAttribute("width", "4032");
      expect(img).toHaveAttribute("height", "3024");
      expect(img).not.toHaveAttribute("srcset"); // direct no-store endpoint, never shared Next image cache
    }
  });
  it("puts the best-ranked photos in the top row", () => {
    for (const layout of Object.values(homeGalleryLayouts)) {
      expect(allocateGalleryColumns(mixed, layout).columns.map(column => column[0]!.id)).toEqual(mixed.slice(0, layout.columns).map(item => item.id));
    }
  });
  it("mixes the sizes inside a column: the best photo stays on top, same-size photos keep their rank and neighbours differ in size", () => {
    // Rank order arrives in clumps of eight tall, eight square and eight wide photos.
    const clumped = [...[1500, 1000, 667].flatMap((height, group) => Array.from({ length: 8 }, (_, i) => photo(group * 8 + i, 1000, height)))];
    const order = clumped.map(item => item.id);
    const sizeOf = (item: HomeGalleryPhoto) => item.image.height;
    for (const layout of Object.values(homeGalleryLayouts)) {
      const { columns } = allocateGalleryColumns(clumped, layout);
      for (const column of columns) {
        expect(column[0]!.id).toBe(order.find(id => column.some(item => item.id === id)));
        for (const height of [1500, 1000, 667]) {
          const same = column.filter(item => sizeOf(item) === height).map(item => order.indexOf(item.id));
          expect(same).toEqual([...same].sort((a, b) => a - b));
        }
        const biggest = Math.max(...[1500, 1000, 667].map(height => column.filter(item => sizeOf(item) === height).length));
        if (biggest <= Math.ceil(column.length / 2)) {
          column.slice(1).forEach((item, i) => expect(sizeOf(item)).not.toBe(sizeOf(column[i]!)));
        }
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
    expect(container.querySelectorAll('[data-row="short-placeholder"]')).toHaveLength(0);
    expect(screen.getByText("아직 사진 없음")).toBeInTheDocument();
    expect(screen.getByText("아직 숏폼 없음")).toBeInTheDocument();
  });
  it.each(["loading", "error"] as const)("keeps the same placeholders without any empty text while %s (a failure is never shown as zero)", (state) => {
    const { container } = render(<HomeGallery locale="ko" photos={state} hasMore={false} shorts={state} />);
    expect(container.querySelectorAll('[data-row="photo-placeholder"]')).toHaveLength(8);
    expect(container.querySelectorAll('[data-row="short-placeholder"]')).toHaveLength(0);
    expect(container.querySelector(`[data-home-state="${state}"]`)).not.toBeNull();
    expect(screen.queryByText("아직 사진 없음")).not.toBeInTheDocument();
    expect(screen.queryByText("아직 숏폼 없음")).not.toBeInTheDocument();
  });
  it("a failed photo read beside working Shorts keeps only the photo area pending", () => {
    render(<HomeGallery locale="ko" photos="error" hasMore={false} shorts={[]} />);
    expect(screen.queryByText("아직 사진 없음")).not.toBeInTheDocument();
    expect(screen.getByText("아직 숏폼 없음")).toBeInTheDocument();
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
  it("shows YouTube videos with their original titles and thumbnails without empty cards", () => {
    const { container } = render(<HomeGallery locale="ko" photos={[]} hasMore={false} shorts={shorts} />);
    expect(container.querySelectorAll('[data-row="short"]')).toHaveLength(3);
    expect(container.querySelectorAll('[data-row="short-placeholder"]')).toHaveLength(0);
    const first = screen.getByRole("button", { name: /R8 라이브 r8-live-watch/ });
    expect(first.querySelector("img")!.getAttribute("src")).toContain("R8shortsAA1/oardefault.jpg");
    expect(screen.getByRole("link", { name: /전체 보기/ })).toHaveAttribute("href", "/shorts?locale=ko");
    fireEvent.click(first);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByTitle("R8 라이브 r8-live-watch")).toHaveAttribute("src", "https://www.youtube.com/embed/R8shortsAA1?rel=0");
    expect(within(dialog).queryByRole("link", { name: /YouTube/ })).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "더 보기" }));
    expect(within(dialog).getByRole("link", { name: /YouTube/ })).toHaveAttribute("href", "https://www.youtube.com/watch?v=R8shortsAA1");
    expect(screen.queryByText("아직 숏폼 없음")).not.toBeInTheDocument();
  });
  it("preserves images within the portrait shortform card", () => {
    const css = readFileSync(resolve(__dirname, "home-placeholder-blocks.module.css"), "utf8").split("\n").filter(line => /object-fit:\s*cover/.test(line));
    expect(css).toEqual([]);
    expect(readFileSync(resolve(__dirname, "home-shorts.module.css"), "utf8")).toContain("aspect-ratio:9/16");
    expect(readFileSync(resolve(__dirname, "home-gallery-page.module.css"), "utf8")).not.toMatch(/object-fit:\s*cover/);
  });
});

describe("/gallery", () => {
  it("lists every photo with its creator, one empty row without data, and a more link", () => {
    const { unmount } = render(<HomeGalleryScreen locale="ko" items={[]} nextCursor={null} />);
    expect(screen.getByText("아직 사진 없음")).toBeInTheDocument();
    unmount();
    render(<HomeGalleryScreen locale="ko" items={photos} nextCursor="abc" />);
    expect(screen.getAllByRole("listitem")).toHaveLength(photos.length * 2);
    for (const layout of ["mobile", "desktop"]) {
      expect(document.querySelectorAll(`[data-gallery-layout="${layout}"] [data-row="photo"]`)).toHaveLength(photos.length);
    }
    expect(screen.getByRole("link", { name: /더 보기/ })).toHaveAttribute("href", "/gallery?locale=ko&cursor=abc");
  });
});
