import type { Route } from "next";
import Link from "next/link";
import { FanAction } from "@/components/fan-ui/fan-action";
import { ChevronLeft } from "@/components/icons";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { NoticeBody } from "@/components/notice/notice-body";
import { homeNoticeCategoryLabels, type HomeNoticeSummary } from "@/features/home/domain/home-notice";
import type { AppLocale } from "@/i18n/locales";
import type { TiptapDocument } from "@/server/notice/notice-domain";
import { formatHomeNoticeDate } from "./home-placeholder-blocks";
import styles from "./home-notice-pages.module.css";

export const homeNoticePageCopy: Record<AppLocale, { title: string; empty: string; more: string }> = {
  ko: { title: "공지사항", empty: "아직 공지 없음", more: "더 보기" },
  en: { title: "Notices", empty: "No notices yet", more: "Show more" },
  ja: { title: "お知らせ", empty: "お知らせはまだありません", more: "もっと見る" },
  "zh-Hans": { title: "公告", empty: "暂无公告", more: "查看更多" },
  "zh-Hant": { title: "公告", empty: "目前沒有公告", more: "查看更多" },
  es: { title: "Avisos", empty: "Aún no hay avisos", more: "Ver más" },
  id: { title: "Pengumuman", empty: "Belum ada pengumuman", more: "Lihat lainnya" },
  vi: { title: "Thông báo", empty: "Chưa có thông báo", more: "Xem thêm" },
  th: { title: "ประกาศ", empty: "ยังไม่มีประกาศ", more: "ดูเพิ่มเติม" },
  pt: { title: "Avisos", empty: "Ainda não há avisos", more: "Ver mais" },
  fr: { title: "Annonces", empty: "Aucune annonce pour l’instant", more: "Voir plus" },
  ru: { title: "Объявления", empty: "Пока нет объявлений", more: "Показать ещё" },
};

/** 20행씩. 0건·오류는 "아직 공지 없음" 한 행(D-2·plan §3.8). */
export function HomeNoticeListScreen({ locale, items, nextCursor }: { locale: AppLocale; items: readonly HomeNoticeSummary[]; nextCursor: string | null }) {
  const copy = homeNoticePageCopy[locale];
  return <div className={styles.page}>
    <FanHeading as="h1">{copy.title}</FanHeading>
    {items.length === 0 ? <p className={styles.empty}>{copy.empty}</p> : <ul className={styles.list}>
      {items.map(item => <li key={item.id} className={styles.row} data-row="notice">
        <Link className={styles.link} href={`/notices/${item.slug}?locale=${locale}` as Route}>
          <span className={styles.category}>{homeNoticeCategoryLabels[locale][item.category]}</span>
          <span className={styles.title}>{item.title}</span>
          <time className={styles.date} dateTime={item.publishedAt}>{formatHomeNoticeDate(item.publishedAt, locale)}</time>
        </Link>
      </li>)}
    </ul>}
    {nextCursor ? <FanAction className={styles.more} href={`/notices?locale=${locale}&cursor=${encodeURIComponent(nextCursor)}`}>{copy.more}</FanAction> : null}
  </div>;
}

export function HomeNoticeDetailScreen({ locale, notice }: { locale: AppLocale; notice: HomeNoticeSummary & { body: TiptapDocument } }) {
  const copy = homeNoticePageCopy[locale];
  return <div className={styles.page}>
    <FanAction variant="text" className={styles.back} href={`/notices?locale=${locale}`} leadingIcon={<ChevronLeft aria-hidden="true" />}>{copy.title}</FanAction>
    <article className={styles.article}>
      <div className={styles.meta}><strong>{homeNoticeCategoryLabels[locale][notice.category]}</strong><time dateTime={notice.publishedAt}>{formatHomeNoticeDate(notice.publishedAt, locale)}</time></div>
      <FanHeading as="h1">{notice.title}</FanHeading>
      <NoticeBody document={notice.body} locale={locale} />
    </article>
  </div>;
}
