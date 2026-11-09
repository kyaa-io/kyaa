import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { homeGalleryCopy, type HomeGalleryPhoto } from "@/features/home/domain/home-gallery";
import type { AppLocale } from "@/i18n/locales";
import { GalleryImage } from "./home-placeholder-blocks";
import styles from "./home-gallery-page.module.css";

/** 24장씩. 0건·오류는 "아직 사진 없음" 한 줄. */
export function HomeGalleryScreen({ locale, items, nextCursor }: { locale: AppLocale; items: readonly HomeGalleryPhoto[]; nextCursor: string | null }) {
  const copy = homeGalleryCopy[locale];
  return <div className={styles.page}>
    <FanHeading as="h1">{copy.title}</FanHeading>
    {items.length === 0 ? <p className={styles.empty}>{copy.empty}</p> : <ul className={styles.grid}>
      {items.map(photo => <li key={photo.id} className={styles.item} data-row="photo">
        <GalleryImage photo={photo} sizes="(min-width: 1024px) 340px, calc(50vw - 20px)" />
        {photo.creator ? <span className={styles.creator}>{photo.creator.name}</span> : null}
      </li>)}
    </ul>}
    {nextCursor ? <FanAction className={styles.more} href={`/gallery?locale=${locale}&cursor=${encodeURIComponent(nextCursor)}`}>{copy.more}</FanAction> : null}
  </div>;
}
