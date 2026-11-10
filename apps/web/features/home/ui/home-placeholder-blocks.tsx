import type { CSSProperties, ReactNode } from "react";
import { FanHeading, FanSectionHeader } from "@/components/fan-ui/fan-heading";
import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { bypassImageOptimization } from "@/components/fan-ui/public-image-policy";
import { homeGalleryCopy, type HomeGalleryPhoto, type HomeShort } from "@/features/home/domain/home-gallery";
import { FanSectionLink } from "@/components/fan-ui/fan-section-link";
import { HomeShorts } from "./home-shorts";
import type { HomeNoticeSummary } from "@/features/home/domain/home-notice";
import { NoticeCard, formatHomeNoticeDate } from "./notice-card";
import { allocateGalleryColumns, homeGalleryLayouts } from "./home-gallery-layout";
import type { AppLocale } from "@/i18n/locales";
import styles from "./home-placeholder-blocks.module.css";

/** Home fallbacks use white surfaces and line tokens. Photo reservations reuse the final column allocation and image ratios. */
const values: Record<AppLocale, readonly string[]> = {
  ko: ["공지사항", "갤러리", "숏폼", "아직 공지 없음", "아직 사진 없음", "아직 숏폼 없음"],
  en: ["Notices", "Gallery", "Shorts", "No notices yet", "No photos yet", "No Shorts yet"],
  ja: ["お知らせ", "ギャラリー", "ショート", "お知らせはまだありません", "写真はまだありません", "ショートはまだありません"],
  "zh-Hans": ["公告", "图库", "短视频", "暂无公告", "暂无照片", "暂无短视频"],
  "zh-Hant": ["公告", "圖庫", "短影片", "目前沒有公告", "目前沒有照片", "目前沒有短影片"],
  es: ["Avisos", "Galería", "Shorts", "Aún no hay avisos", "Aún no hay fotos", "Aún no hay Shorts"],
  id: ["Pengumuman", "Galeri", "Shorts", "Belum ada pengumuman", "Belum ada foto", "Belum ada Shorts"],
  vi: ["Thông báo", "Thư viện ảnh", "Shorts", "Chưa có thông báo", "Chưa có ảnh", "Chưa có Shorts"],
  th: ["ประกาศ", "แกลเลอรี", "ช็อตส์", "ยังไม่มีประกาศ", "ยังไม่มีรูปภาพ", "ยังไม่มีช็อตส์"],
  pt: ["Avisos", "Galeria", "Shorts", "Ainda não há avisos", "Ainda não há fotos", "Ainda não há Shorts"],
  fr: ["Annonces", "Galerie", "Shorts", "Aucune annonce pour l’instant", "Aucune photo pour l’instant", "Aucun Short pour l’instant"],
  ru: ["Объявления", "Галерея", "Shorts", "Пока нет объявлений", "Пока нет фото", "Пока нет Shorts"],
};

const viewAll: Record<AppLocale, string> = {
  ko: "전체 보기", en: "View all", ja: "すべて見る", "zh-Hans": "查看全部", "zh-Hant": "查看全部", es: "Ver todo",
  id: "Lihat semua", vi: "Xem tất cả", th: "ดูทั้งหมด", pt: "Ver tudo", fr: "Tout voir", ru: "Смотреть все",
};

export { formatHomeNoticeDate };

/** 최대 5개의 공지를 표시한다. */
export function HomeNotices({ locale, notices }: { locale: AppLocale; notices: readonly HomeNoticeSummary[] | "loading" | "error" }) {
  if (typeof notices === "string") return <HomeNoticesPlaceholder locale={locale} state={notices} />;
  if (!notices.length) return <HomeNoticesPlaceholder locale={locale} state="empty" />;
  const v = values[locale];
  const rows = notices.slice(0, 5);
  return <div className={styles.block}>
    <NoticeCard locale={locale} items={rows} blockName="notices" headingId="home-notices-heading" title={v[0]!} footer={{ href: `/notices?locale=${locale}`, label: viewAll[locale] }} />
  </div>;
}

/** Only a read that found nothing says "아직 공지 없음". */
export function HomeNoticesPlaceholder({ locale, state = "loading" }: { locale: AppLocale; state?: "loading" | "error" | "empty" }) {
  const v = values[locale];
  return <section className={styles.block} aria-labelledby="home-notices-heading" data-home-block="notices" data-home-state={state}>
    <FanSectionHeader variant="editorial" id="home-notices-heading" title={v[0]!} action={state === "empty" ? { href: `/notices?locale=${locale}`, label: viewAll[locale] } : undefined} />
    {state === "empty" && <p className={styles.note}>{v[3]}</p>}
  </section>;
}

/** Loading or a failed read: the same placeholder tiles, without the "none yet" text (that text is only for a read that found nothing). */
export type HomeBlockPending = "loading" | "error";

export function HomeGalleryPlaceholder({ locale, state = "loading", expectedPhotos }: { locale: AppLocale; state?: HomeBlockPending; expectedPhotos?: readonly HomeGalleryPhoto[] }) {
  return <HomeGallery locale={locale} photos={state} hasMore={false} shorts={state} expectedPhotos={expectedPhotos} />;
}

/** 사진 구역(R8-DATA N2) + 숏츠 선반. 정상 0건만 "아직 없음"을 보이고, 로딩·실패는 같은 자리표시를 글 없이 둔다. 사진은 원본 비율로 모두 쌓고 열 끝을 맞춘다. 자리표시는 로딩·실패·0건일 때만 둔다. */
export function HomeGallery({ locale, photos, hasMore, shorts, expectedPhotos }: { expectedPhotos?: readonly HomeGalleryPhoto[]; locale: AppLocale; photos: readonly HomeGalleryPhoto[] | HomeBlockPending; hasMore: boolean; shorts: readonly HomeShort[] | HomeBlockPending }) {
  const v = values[locale];
  const list = typeof photos === "string" ? null : photos;
  const shortList = typeof shorts === "string" ? null : shorts;
  const mobile = list?.length ? allocateGalleryColumns(list, homeGalleryLayouts.mobile) : null;
  const desktop = list?.length ? allocateGalleryColumns(list, homeGalleryLayouts.desktop) : null;
  const reservation = list === null && expectedPhotos?.length ? expectedPhotos : null;
  const more = !!list?.length && hasMore;
  return <section className={styles.block} aria-labelledby="home-gallery-heading" data-home-block="gallery">
    <FanSectionHeader variant="editorial" id="home-gallery-heading" title={v[1]!} action={more ? { href: `/gallery?locale=${locale}`, label: homeGalleryCopy[locale].viewAll } : undefined} />
    {mobile && desktop ? <>
      <GalleryColumns columns={mobile.columns} layout="mobile" />
      <GalleryColumns columns={desktop.columns} layout="desktop" />
    </> : reservation ? <>
      <GalleryReservation photos={reservation} layout="mobile" />
      <GalleryReservation photos={reservation} layout="desktop" />
    </> : <div className={styles.photos} data-home-measure="photos" data-home-state={typeof photos === "string" ? photos : "empty"}>{Array.from({ length: 8 }, (_, i) => <span key={i} className={styles.tile} data-row="photo-placeholder" aria-hidden={i > 0 || list === null || undefined}>{i === 0 && list ? <span className={styles.note}>{v[4]}</span> : null}</span>)}</div>}
    {shortList?.length === 0 ? null : <div className={styles.shelf} data-home-measure="shorts">
      <div className={styles.shortHead}><FanHeading as="h3">{v[2]}</FanHeading>{shortList?.length ? <FanSectionLink href={`/shorts?locale=${locale}`}>{homeGalleryCopy[locale].viewAll}</FanSectionLink> : null}</div>
      {shortList?.length ? <HomeShorts items={shortList} locale={locale} /> : <div data-home-state={typeof shorts === "string" ? shorts : undefined} />}
    </div>}
  </section>;
}

/** The photos laid into the layout's columns (`allocateGalleryColumns`). `caption` adds a line under each photo; `itemClassName` styles that item. */
export function GalleryColumns({ columns, layout, caption, itemClassName }: { columns: readonly (readonly HomeGalleryPhoto[])[]; layout: "mobile" | "desktop"; caption?: (photo: HomeGalleryPhoto) => ReactNode; itemClassName?: string }) {
  return <div className={`${styles.photoColumns} ${layout === "mobile" ? styles.mobileOnly : styles.desktopOnly}`} data-home-measure="photos" data-gallery-layout={layout}>
    {columns.map((photos, index) => <ul key={index} className={styles.photoColumn}>
      {photos.map(photo => <li key={photo.id} className={[styles.photo, itemClassName].filter(Boolean).join(" ")} data-row="photo"><GalleryImage photo={photo} sizes={layout === "mobile" ? "calc(50vw - 20px)" : "340px"} />{caption?.(photo)}</li>)}
    </ul>)}
  </div>;
}

export function GalleryImage({ photo, sizes }: { photo: HomeGalleryPhoto; sizes: string }) {
  // Content assets recheck visibility on every request (private, no-store). Do not put them in the shared optimizer cache.
  const unoptimized = photo.image.url.startsWith("/api/content-assets/") || bypassImageOptimization(photo.image.url);
  const image = <Image className={styles.photoImage} src={photo.image.url} alt={photo.alt} width={photo.image.width} height={photo.image.height}
    sizes={sizes} loading="lazy" unoptimized={unoptimized} />;
  return photo.sourceHref ? <Link className={styles.photoLink} href={photo.sourceHref as Route}>{image}</Link> : image;
}

/** Same allocation, responsive column widths and per-image ratios as the loaded gallery. */
function GalleryReservation({ photos, layout }: { photos: readonly HomeGalleryPhoto[]; layout: "mobile" | "desktop" }) {
  const { columns } = allocateGalleryColumns(photos, homeGalleryLayouts[layout]);
  return <div className={`${styles.photoColumns} ${layout === "mobile" ? styles.mobileOnly : styles.desktopOnly}`} data-home-measure="photos" data-gallery-reservation={layout} aria-hidden="true">
    {columns.map((column, index) => <ul key={index} className={styles.photoColumn}>
      {column.map(photo => <li key={photo.id} className={`${styles.photo} ${styles.tile} ${styles.reservationTile}`} data-row="photo-placeholder" style={{ "--gallery-photo-ratio": `${photo.image.width} / ${photo.image.height}` } as CSSProperties} />)}
    </ul>)}
  </div>;
}
