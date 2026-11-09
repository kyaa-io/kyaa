import { FanHeading, FanSectionHeader } from "@/components/fan-ui/fan-heading";
import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { bypassImageOptimization } from "@/components/fan-ui/public-image-policy";
import { homeGalleryCopy, type HomeGalleryPhoto, type HomeShort } from "@/features/home/domain/home-gallery";
import { MediaThumbnail } from "@/features/media/ui/media-thumbnail";
import { homeNoticeCategoryLabels, type HomeNoticeSummary } from "@/features/home/domain/home-notice";
import { allocateGalleryColumns, homeGalleryLayouts } from "./home-gallery-layout";
import type { AppLocale } from "@/i18n/locales";
import styles from "./home-placeholder-blocks.module.css";

/**
 * 7차 임시 구성: 공지사항·갤러리·숏츠는 데이터 원천(CMS·API)이 다음 묶음에서 생긴다. 그때까지 시안의 블록 높이를 지킨 자리표시만 둔다.
 * 높이는 데이터와 무관하게 같다(R8-RULE-1): 공지 5행(390 64px·1440 48px), 사진 구역 390 570px·1440 712px, 숏츠 카드 9:16.
 */
const values: Record<AppLocale, readonly string[]> = {
  ko: ["공지사항", "갤러리", "숏츠", "아직 공지 없음", "아직 사진 없음", "아직 숏츠 없음"],
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

export function formatHomeNoticeDate(value: string, locale: AppLocale) {
  return new Intl.DateTimeFormat(locale, { calendar: "gregory", month: "2-digit", day: "2-digit", timeZone: "Asia/Seoul" }).format(new Date(value));
}

/** 공지 5행(R8-DATA N1). 정상 0건만 "아직 공지 없음", 로딩·실패는 글 없는 자리표시, 1~4건은 남은 행을 "—"로 채우고, 5건이면 전체 보기를 단다. */
export function HomeNotices({ locale, notices }: { locale: AppLocale; notices: readonly HomeNoticeSummary[] | "loading" | "error" }) {
  if (typeof notices === "string") return <HomeNoticesPlaceholder locale={locale} state={notices} />;
  if (!notices.length) return <HomeNoticesPlaceholder locale={locale} state="empty" />;
  const v = values[locale];
  const rows = notices.slice(0, 5);
  return <section className={styles.block} aria-labelledby="home-notices-heading" data-home-block="notices">
    <FanSectionHeader variant="editorial" id="home-notices-heading" title={v[0]!} action={rows.length >= 5 ? { href: `/notices?locale=${locale}`, label: viewAll[locale] } : undefined} />
    <ul className={styles.notices}>
      {rows.map(item => <li key={item.id} className={styles.notice} data-row="notice">
        <Link className={styles.noticeLink} href={`${item.linkHref ?? `/notices/${item.slug}`}?locale=${locale}` as Route}>
          <span className={styles.noticeCategory}>{homeNoticeCategoryLabels[locale][item.category]}</span>
          <span className={styles.noticeTitle}>{item.title}</span>
          <time className={styles.noticeDate} dateTime={item.publishedAt}>{formatHomeNoticeDate(item.publishedAt, locale)}</time>
        </Link>
      </li>)}
      {Array.from({ length: 5 - rows.length }, (_, i) => <li key={`empty-${i}`} className={styles.notice} data-row="notice-placeholder" aria-hidden="true"><span className={styles.note}>{"—"}</span></li>)}
    </ul>
  </section>;
}

/** 5 placeholder rows. Only a read that found nothing says "아직 공지 없음"; loading and a failed read keep the rows without it (20:52). */
export function HomeNoticesPlaceholder({ locale, state = "loading" }: { locale: AppLocale; state?: "loading" | "error" | "empty" }) {
  const v = values[locale];
  return <section className={styles.block} aria-labelledby="home-notices-heading" data-home-block="notices" data-home-state={state}>
    <FanSectionHeader variant="editorial" id="home-notices-heading" title={v[0]!} />
    <ul className={styles.notices}>{Array.from({ length: 5 }, (_, i) => <li key={i} className={styles.notice} data-row="notice-placeholder" aria-hidden={i > 0 || state !== "empty" || undefined}><span className={styles.note}>{i === 0 && state === "empty" ? v[3] : "—"}</span></li>)}</ul>
  </section>;
}

/** Loading or a failed read: the same placeholder tiles, without the "none yet" text (that text is only for a read that found nothing). */
export type HomeBlockPending = "loading" | "error";

export function HomeGalleryPlaceholder({ locale, state = "loading" }: { locale: AppLocale; state?: HomeBlockPending }) {
  return <HomeGallery locale={locale} photos={state} hasMore={false} shorts={state} />;
}

/** 사진 구역(R8-DATA N2) + 숏츠 선반. 정상 0건만 "아직 없음"을 보이고, 로딩·실패는 같은 자리표시를 글 없이 둔다. 사진은 원본 비율로 쌓고 남은 높이를 자리표시로 채운다. */
export function HomeGallery({ locale, photos, hasMore, shorts }: { locale: AppLocale; photos: readonly HomeGalleryPhoto[] | HomeBlockPending; hasMore: boolean; shorts: readonly HomeShort[] | HomeBlockPending }) {
  const v = values[locale];
  const list = typeof photos === "string" ? null : photos;
  const shortList = typeof shorts === "string" ? null : shorts;
  const mobile = list?.length ? allocateGalleryColumns(list, homeGalleryLayouts.mobile) : null;
  const desktop = list?.length ? allocateGalleryColumns(list, homeGalleryLayouts.desktop) : null;
  const more = !!list?.length && (hasMore || mobile!.placed < list.length || desktop!.placed < list.length);
  return <section className={styles.block} aria-labelledby="home-gallery-heading" data-home-block="gallery">
    <FanSectionHeader variant="editorial" id="home-gallery-heading" title={v[1]!} action={more ? { href: `/gallery?locale=${locale}`, label: homeGalleryCopy[locale].viewAll } : undefined} />
    {mobile && desktop ? <>
      <GalleryColumns columns={mobile.columns} layout="mobile" />
      <GalleryColumns columns={desktop.columns} layout="desktop" />
    </> : <div className={styles.photos} data-home-measure="photos" data-home-state={typeof photos === "string" ? photos : "empty"}>{Array.from({ length: 8 }, (_, i) => <span key={i} className={styles.tile} data-row="photo-placeholder" aria-hidden={i > 0 || list === null || undefined}>{i === 0 && list ? <span className={styles.note}>{v[4]}</span> : null}</span>)}</div>}
    <div className={styles.shelf} data-home-measure="shorts">
      <FanHeading as="h3">{v[2]}</FanHeading>
      {shortList?.length ? <ul className={styles.rail}>
        {shortList.map(item => <li key={item.videoId} className={styles.short} data-row="short">
          <Link className={styles.shortLink} href={item.liveHref as Route}>
            <span className={styles.card}><MediaThumbnail image={null} href={item.href} kind="videos" locale={locale} /></span>
            <span className={styles.shortTitle}>{item.title}</span>
          </Link>
        </li>)}
        {Array.from({ length: Math.max(0, 4 - shortList.length) }, (_, i) => <li key={`empty-${i}`} className={styles.short} data-row="short-placeholder" aria-hidden="true">
          <span className={styles.card} /><span className={styles.shortTitle}>{"—"}</span>
        </li>)}
      </ul> : <ul className={styles.rail} data-home-state={typeof shorts === "string" ? shorts : "empty"}>{Array.from({ length: 4 }, (_, i) => <li key={i} className={styles.short} data-row="short-placeholder" aria-hidden={i > 0 || shortList === null || undefined}>
        <span className={styles.card}>{i === 0 && shortList ? <span className={styles.note}>{v[5]}</span> : null}</span>
        <span className={styles.shortTitle}>{"—"}</span>
      </li>)}</ul>}
    </div>
  </section>;
}

function GalleryColumns({ columns, layout }: { columns: readonly (readonly HomeGalleryPhoto[])[]; layout: "mobile" | "desktop" }) {
  return <div className={`${styles.photoColumns} ${layout === "mobile" ? styles.mobileOnly : styles.desktopOnly}`} data-home-measure="photos" data-gallery-layout={layout}>
    {columns.map((photos, index) => <ul key={index} className={styles.photoColumn}>
      {photos.map(photo => <li key={photo.id} className={styles.photo} data-row="photo"><GalleryImage photo={photo} sizes={layout === "mobile" ? "calc(50vw - 20px)" : "340px"} /></li>)}
      <li className={styles.tile} data-row="photo-placeholder" aria-hidden="true" />
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
