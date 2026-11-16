import { FanHeading } from "@/components/fan-ui/fan-heading";
import { homeGalleryCopy, type HomeGalleryPhoto } from "@/features/home/domain/home-gallery";
import type { AppLocale } from "@/i18n/locales";
import { HomeGalleryList } from "./home-gallery-list";
import styles from "./home-gallery-page.module.css";

/** 24장씩, 목록 끝에 가까워지면 다음 24장이 이어 붙는다. 0건·오류는 "아직 사진 없음" 한 줄. */
export function HomeGalleryScreen({ locale, items: read, nextCursor }: { locale: AppLocale; items: readonly HomeGalleryPhoto[]; nextCursor: string | null }) {
  const copy = homeGalleryCopy[locale];
  return <div className={styles.page}>
    <FanHeading as="h1">{copy.title}</FanHeading>
    {read.length === 0 ? <p className={styles.empty}>{copy.empty}</p> : <HomeGalleryList locale={locale} firstPage={read} firstCursor={nextCursor} />}
  </div>;
}
