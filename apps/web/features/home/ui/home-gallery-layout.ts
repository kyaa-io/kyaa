import type { HomeGalleryPhoto } from "@/features/home/domain/home-gallery";

/**
 * Fills a fixed-height photo area without cropping (image-framing.md): each photo keeps its original ratio at the column width and is
 * placed in the shortest column only while it fits whole; the rest of every column stays a placeholder tile. Heights are in units of
 * the column width. Budgets assume the widest column of each layout (mobile 2 columns up to a 480px phone, desktop 4 columns at the
 * 1440px shell) so a placed photo never runs past the area at 390 or 1440; wider tablets fall back to the column's overflow clip.
 */
export const homeGalleryLayouts = {
  mobile: { columns: 2, budget: 2.6, gap: 0.04 },
  desktop: { columns: 4, budget: 2.0, gap: 0.035 },
} as const;

export function allocateGalleryColumns(photos: readonly HomeGalleryPhoto[], layout: { columns: number; budget: number; gap: number }) {
  const columns = Array.from({ length: layout.columns }, () => ({ photos: [] as HomeGalleryPhoto[], used: 0 }));
  let placed = 0;
  for (const photo of photos) {
    const height = photo.image.height / photo.image.width;
    const fits = columns.filter(column => column.used + (column.photos.length ? layout.gap : 0) + height <= layout.budget)
      .sort((a, b) => a.used - b.used)[0];
    if (!fits) continue;
    fits.used += (fits.photos.length ? layout.gap : 0) + height;
    fits.photos.push(photo);
    placed += 1;
  }
  return { columns: columns.map(column => column.photos), placed };
}
