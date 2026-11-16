"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { homeGalleryCopy, homeGalleryResponseSchema, type HomeGalleryPhoto } from "@/features/home/domain/home-gallery";
import { diversifyGalleryPhotos } from "@/features/home/domain/home-gallery-order";
import { participationCopy } from "@/i18n/catalogs/features__schedules__ui__participation";
import { toContentLocale, type AppLocale } from "@/i18n/locales";
import { allocateGalleryColumns, appendToGalleryColumns, homeGalleryLayouts } from "./home-gallery-layout";
import { GalleryColumns } from "./home-placeholder-blocks";
import styles from "./home-gallery-page.module.css";

/**
 * /gallery photo columns. The next 24 photos load when the 더 보기 button comes within 800px of the screen; the button stays
 * (loading spinner, then "다시 시도" after a failure) so keyboard and screen reader users can load by hand and still reach the footer.
 * The first page is levelled across the columns; each later page goes under the shortest columns, so photos already on screen never move.
 * A photo seen twice is dropped.
 */
export function HomeGalleryList({ locale, firstPage, firstCursor }: { locale: AppLocale; firstPage: readonly HomeGalleryPhoto[]; firstCursor: string | null }) {
  const [pages, setPages] = useState<readonly (readonly HomeGalleryPhoto[])[]>(() => [diversifyGalleryPhotos(firstPage)]);
  const [cursor, setCursor] = useState(firstCursor);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const busy = useRef(false);
  const seen = useRef(new Set(firstPage.map(photo => photo.id)));
  const tail = useRef<HTMLDivElement>(null);
  const loadMore = useCallback(async () => {
    if (busy.current || cursor === null) return;
    busy.current = true;
    setLoading(true);
    setFailed(false);
    try {
      const response = await fetch(`/api/public/gallery?locale=${toContentLocale(locale)}&cursor=${encodeURIComponent(cursor)}`);
      if (!response.ok) throw new Error();
      const page = homeGalleryResponseSchema.parse(await response.json());
      const fresh = page.items.filter(photo => !seen.current.has(photo.id));
      fresh.forEach(photo => seen.current.add(photo.id));
      if (fresh.length) setPages(current => [...current, diversifyGalleryPhotos(fresh)]);
      setCursor(page.nextCursor);
    } catch { setFailed(true); } finally { busy.current = false; setLoading(false); }
  }, [cursor, locale]);
  useEffect(() => {
    const node = tail.current;
    if (!node || cursor === null || failed) return;
    const watch = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) void loadMore(); }, { rootMargin: "800px 0px" });
    watch.observe(node);
    return () => watch.disconnect();
  }, [cursor, failed, loadMore, pages]);
  return <>
    {(["mobile", "desktop"] as const).map(layout => {
      const sizes = homeGalleryLayouts[layout];
      const columns = pages.slice(1).reduce((placed, page) => appendToGalleryColumns(placed, page, sizes), allocateGalleryColumns(pages[0]!, sizes).columns);
      return <GalleryColumns key={layout} layout={layout} columns={columns} itemClassName={styles.item}
        caption={photo => photo.creator ? <span className={styles.creator}>{photo.creator.name}</span> : null} />;
    })}
    {cursor === null ? null : <div ref={tail} className={styles.tail}>
      <FanAction variant="neutral" type="button" loading={loading} onClick={() => void loadMore()}>{failed ? participationCopy(locale).retry : homeGalleryCopy[locale].more}</FanAction>
    </div>}
  </>;
}
