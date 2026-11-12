import type { Route } from "next";
import Link from "../../../components/fan-ui/hover-prefetch-link";
import { paginationCopy } from "@/i18n/catalogs/common__pagination";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanBackAction } from "@/components/fan-ui/fan-back-action";
import { ChevronLeft, ChevronRight } from "@/components/icons";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { NoticeBody } from "@/components/notice/notice-body";
import { homeNoticeCategoryLabels, type HomeNoticeSummary } from "@/features/home/domain/home-notice";
import type { AppLocale } from "@/i18n/locales";
import type { TiptapDocument } from "@/server/notice/notice-domain";
import { NoticeCard, formatHomeNoticeDate } from "./notice-card";
import { FanActivityGuide } from "./fan-activity-guide";
import styles from "./home-notice-pages.module.css";

export const homeNoticePageCopy: Record<AppLocale, { title: string; empty: string; more: string; recent: string; others: string }> = {
  ko: { title: "공지사항", empty: "아직 공지 없음", more: "더 보기", recent: "최근 공지사항", others: "다른 공지" },
  en: { title: "Notices", empty: "No notices yet", more: "Show more", recent: "Recent notices", others: "Other notices" },
  ja: { title: "お知らせ", empty: "お知らせはまだありません", more: "もっと見る", recent: "最近のお知らせ", others: "ほかのお知らせ" },
  "zh-Hans": { title: "公告", empty: "暂无公告", more: "查看更多", recent: "最新公告", others: "其他公告" },
  "zh-Hant": { title: "公告", empty: "目前沒有公告", more: "查看更多", recent: "最新公告", others: "其他公告" },
  es: { title: "Avisos", empty: "Aún no hay avisos", more: "Ver más", recent: "Avisos recientes", others: "Otros avisos" },
  id: { title: "Pengumuman", empty: "Belum ada pengumuman", more: "Lihat lainnya", recent: "Pengumuman terbaru", others: "Pengumuman lain" },
  vi: { title: "Thông báo", empty: "Chưa có thông báo", more: "Xem thêm", recent: "Thông báo gần đây", others: "Thông báo khác" },
  th: { title: "ประกาศ", empty: "ยังไม่มีประกาศ", more: "ดูเพิ่มเติม", recent: "ประกาศล่าสุด", others: "ประกาศอื่น ๆ" },
  pt: { title: "Avisos", empty: "Ainda não há avisos", more: "Ver mais", recent: "Avisos recentes", others: "Outros avisos" },
  fr: { title: "Annonces", empty: "Aucune annonce pour l’instant", more: "Voir plus", recent: "Annonces récentes", others: "Autres annonces" },
  ru: { title: "Объявления", empty: "Пока нет объявлений", more: "Показать ещё", recent: "Последние объявления", others: "Другие объявления" },
};

/** 10개씩 표시하고 이전·다음 페이지로 이동한다. */
export function HomeNoticeListScreen({ locale, items, nextCursor, page = 1, pageCount = 1, legacyCursor = false }: { locale: AppLocale; items: readonly HomeNoticeSummary[]; nextCursor: string | null; page?: number; pageCount?: number; legacyCursor?: boolean }) {
  const copy = homeNoticePageCopy[locale];
  const pagination = paginationCopy(locale);
  const href = (number: number) => `/notices?locale=${locale}${number > 1 ? `&page=${number}` : ""}` as Route;
  const firstNumber = Math.max(1, Math.min(page - 2, pageCount - 4));
  const numbers = Array.from({ length: Math.min(5, pageCount) }, (_, index) => firstNumber + index);
  return <div className={`${styles.page} ${styles.listPage}`}>
    <div className={styles.listHeading}><FanBackAction locale={locale} fallbackHref={`/?locale=${locale}`} className={styles.listBack} /><FanHeading as="h1">{copy.title}</FanHeading></div>
    <NoticeCard locale={locale} items={items} soft>
    {items.length === 0 && <p className={styles.empty}>{copy.empty}</p>}
    {(pageCount > 1 || legacyCursor) && <nav className={styles.listPagination} aria-label={copy.title}>
      {page > 1 || legacyCursor ? <Link href={href(legacyCursor ? 1 : page - 1)} aria-label={pagination.previous}><ChevronLeft aria-hidden="true" /></Link> : <span aria-disabled="true"><ChevronLeft aria-hidden="true" /></span>}
      {!legacyCursor && numbers.map(number => number === page ? <span key={number} aria-current="page">{new Intl.NumberFormat(locale).format(number)}</span> : <Link key={number} href={href(number)} aria-label={`${copy.title} ${new Intl.NumberFormat(locale).format(number)}`}>{new Intl.NumberFormat(locale).format(number)}</Link>)}
      {legacyCursor ? nextCursor && <Link href={`/notices?locale=${locale}&cursor=${encodeURIComponent(nextCursor)}` as Route} aria-label={pagination.next}><ChevronRight aria-hidden="true" /></Link> : page < pageCount ? <Link href={href(page + 1)} aria-label={pagination.next}><ChevronRight aria-hidden="true" /></Link> : <span aria-disabled="true"><ChevronRight aria-hidden="true" /></span>}
    </nav>}
    </NoticeCard>
  </div>;
}

export function HomeNoticeDetailScreen({ locale, notice, others }: { locale: AppLocale; notice: HomeNoticeSummary & { body: TiptapDocument }; others: readonly HomeNoticeSummary[] }) {
  const copy = homeNoticePageCopy[locale];
  return <div className={styles.page}>
    <FanAction variant="text" className={styles.back} href={`/notices?locale=${locale}`} leadingIcon={<ChevronLeft aria-hidden="true" />}>{copy.title}</FanAction>
    <article className={styles.article}>
      <div className={styles.meta}><strong>{homeNoticeCategoryLabels[locale][notice.category]}</strong><time dateTime={notice.publishedAt}>{formatHomeNoticeDate(notice.publishedAt, locale)}</time></div>
      <FanHeading as="h1">{notice.title}</FanHeading>
      {notice.slug === "service-guide" ? <FanActivityGuide locale={locale} /> : <NoticeBody document={notice.body} locale={locale} />}
    </article>
    {others.length > 0 && <div className={styles.related} data-block="notice-related"><NoticeCard locale={locale} items={others} headingId="notice-others-heading" title={copy.others} headAction={{ href: `/notices?locale=${locale}`, label: copy.recent }} /></div>}
  </div>;
}
