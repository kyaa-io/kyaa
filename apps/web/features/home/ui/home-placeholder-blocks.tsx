import { FanHeading, FanSectionHeader } from "@/components/fan-ui/fan-heading";
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

export function HomeNoticesPlaceholder({ locale }: { locale: AppLocale }) {
  const v = values[locale];
  return <section className={styles.block} aria-labelledby="home-notices-heading" data-home-block="notices">
    <FanSectionHeader variant="editorial" id="home-notices-heading" title={v[0]!} />
    <ul className={styles.notices}>{Array.from({ length: 5 }, (_, i) => <li key={i} className={styles.notice} data-row="notice-placeholder" aria-hidden={i > 0 || undefined}><span className={styles.note}>{i === 0 ? v[3] : "—"}</span></li>)}</ul>
  </section>;
}

export function HomeGalleryPlaceholder({ locale }: { locale: AppLocale }) {
  const v = values[locale];
  return <section className={styles.block} aria-labelledby="home-gallery-heading" data-home-block="gallery">
    <FanSectionHeader variant="editorial" id="home-gallery-heading" title={v[1]!} />
    <div className={styles.photos} data-home-measure="photos">{Array.from({ length: 8 }, (_, i) => <span key={i} className={styles.tile} data-row="photo-placeholder" aria-hidden={i > 0 || undefined}>{i === 0 ? <span className={styles.note}>{v[4]}</span> : null}</span>)}</div>
    <div className={styles.shelf} data-home-measure="shorts">
      <FanHeading as="h3">{v[2]}</FanHeading>
      <ul className={styles.rail}>{Array.from({ length: 4 }, (_, i) => <li key={i} className={styles.short} data-row="short-placeholder" aria-hidden={i > 0 || undefined}>
        <span className={styles.card}>{i === 0 ? <span className={styles.note}>{v[5]}</span> : null}</span>
        <span className={styles.shortTitle}>{"—"}</span>
      </li>)}</ul>
    </div>
  </section>;
}
