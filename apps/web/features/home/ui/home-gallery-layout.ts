import type { HomeGalleryPhoto } from "@/features/home/domain/home-gallery";

/**
 * Stacks every photo at its original ratio (image-framing.md: no empty tile) and evens out the column bottoms.
 * Heights are in units of the column width. The home block grows with its photos; a placeholder tile exists only while the read is
 * loading, failed or found nothing. `gap` is the 8px (mobile) and 12px (desktop) column gap in the same units.
 * Nothing is cropped or stretched to level the bottoms: the leftover under a shorter column (`spread`) is whatever the photo ratios leave.
 */
export const homeGalleryLayouts = {
  mobile: { columns: 2, gap: 0.046 },
  desktop: { columns: 4, gap: 0.035 },
} as const;

type Layout = { columns: number; gap: number };

const ratio = (photo: HomeGalleryPhoto) => photo.image.height / photo.image.width;
const columnHeight = (heights: readonly number[], gap: number) => heights.reduce((sum, h) => sum + h, 0) + gap * Math.max(0, heights.length - 1);

/**
 * Shortest column first, then moves and swaps between columns until the tallest and shortest column differ as little as possible.
 * The first photo of each column is the first `columns` photos in the given order (rank first) and never moves, so the top row is always
 * the best-ranked photos; order inside a column follows the given order.
 */
export function allocateGalleryColumns(photos: readonly HomeGalleryPhoto[], layout: Layout) {
  const count = Math.min(layout.columns, photos.length);
  const heights = photos.map(ratio);
  const owner = new Array<number>(photos.length);
  const sums = new Array<number>(count).fill(0);
  const sizes = new Array<number>(count).fill(0);
  const used = (column: number, sum = sums[column]!, size = sizes[column]!) => (size ? sum + layout.gap * (size - 1) : 0);
  photos.forEach((_, index) => {
    let target = 0;
    for (let column = 1; column < count; column += 1) if (used(column) < used(target)) target = column;
    owner[index] = target; sums[target]! += heights[index]!; sizes[target]! += 1;
  });
  const spread = () => Math.max(...sums.map((_, c) => used(c))) - Math.min(...sums.map((_, c) => used(c)));
  for (let pass = 0; pass < 200; pass += 1) {
    let best = spread(); let move: [number, number, number] | null = null;
    const trial = (change: () => void, undo: () => void, mark: [number, number, number]) => {
      change(); const value = spread(); undo();
      if (value < best - 1e-9) { best = value; move = mark; }
    };
    for (let a = count; a < photos.length; a += 1) {
      for (let to = 0; to < count; to += 1) {
        const from = owner[a]!; if (from === to || sizes[from]! < 2) continue;
        trial(() => { sums[from]! -= heights[a]!; sizes[from]! -= 1; sums[to]! += heights[a]!; sizes[to]! += 1; },
          () => { sums[from]! += heights[a]!; sizes[from]! += 1; sums[to]! -= heights[a]!; sizes[to]! -= 1; }, [a, -1, to]);
      }
      for (let b = a + 1; b < photos.length; b += 1) {
        const ca = owner[a]!; const cb = owner[b]!; if (ca === cb) continue;
        trial(() => { sums[ca]! += heights[b]! - heights[a]!; sums[cb]! += heights[a]! - heights[b]!; },
          () => { sums[ca]! -= heights[b]! - heights[a]!; sums[cb]! -= heights[a]! - heights[b]!; }, [a, b, -1]);
      }
    }
    if (!move) break;
    const [a, b, to] = move as [number, number, number];
    if (b < 0) { const from = owner[a]!; sums[from]! -= heights[a]!; sizes[from]! -= 1; sums[to]! += heights[a]!; sizes[to]! += 1; owner[a] = to; }
    else { const ca = owner[a]!; const cb = owner[b]!; sums[ca]! += heights[b]! - heights[a]!; sums[cb]! += heights[a]! - heights[b]!; owner[a] = cb; owner[b] = ca; }
  }
  const columns = Array.from({ length: count }, (_, column) => photos.filter((_, index) => owner[index] === column));
  const lengths = columns.map(column => columnHeight(column.map(ratio), layout.gap));
  return { columns, placed: photos.length, spread: lengths.length ? Math.max(...lengths) - Math.min(...lengths) : 0 };
}
