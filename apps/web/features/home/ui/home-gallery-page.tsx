import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { homeGalleryCopy, type HomeGalleryPhoto } from "@/features/home/domain/home-gallery";
import type { AppLocale } from "@/i18n/locales";
import { allocateGalleryColumns, homeGalleryLayouts } from "./home-gallery-layout";
import { GalleryColumns } from "./home-placeholder-blocks";
import styles from "./home-gallery-page.module.css";

/** 24장씩. 0건·오류는 "아직 사진 없음" 한 줄. */
export function HomeGalleryScreen({ locale, items, nextCursor }: { locale: AppLocale; items: readonly HomeGalleryPhoto[]; nextCursor: string | null }) {
  const copy = homeGalleryCopy[locale];
  return <div className={styles.page}>
    <FanHeading as="h1">{copy.title}</FanHeading>
    {items.length === 0 ? <p className={styles.empty}>{copy.empty}</p> : (["mobile", "desktop"] as const).map(layout =>
      <GalleryColumns key={layout} layout={layout} columns={allocateGalleryColumns(items, homeGalleryLayouts[layout]).columns} itemClassName={styles.item}
        caption={photo => photo.creator ? <span className={styles.creator}>{photo.creator.name}</span> : null} />)}
    {nextCursor ? <FanAction className={styles.more} href={`/gallery?locale=${locale}&cursor=${encodeURIComponent(nextCursor)}`}>{copy.more}</FanAction> : null}
  </div>;
}
