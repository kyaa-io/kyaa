import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { homeNoticeCategoryLabels, type HomeNoticeSummary } from "@/features/home/domain/home-notice";
import type { AppLocale } from "@/i18n/locales";
import styles from "./notice-card.module.css";

export function formatHomeNoticeDate(value: string, locale: AppLocale) {
  const parts = new Intl.DateTimeFormat(locale, { calendar: "gregory", year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Seoul" }).formatToParts(new Date(value));
  return ["year", "month", "day"].map(type => parts.find(part => part.type === type)?.value).join(".");
}

type NoticeLink = { href: string; label: string };

/** 홈·공지 목록·공지 상세가 함께 쓰는 공지 카드. 랭킹 카드와 같은 외곽(12 반경, 1px 선)에 제목 줄, 행, 아래 링크를 담는다. */
export function NoticeCard({ locale, items, headingId, title, headAction, footer, soft = false, blockName = "notice-card", children }: {
  locale: AppLocale; items: readonly HomeNoticeSummary[]; headingId?: string; title?: string; headAction?: NoticeLink; footer?: NoticeLink; soft?: boolean; blockName?: string; children?: ReactNode;
}) {
  return <section className={`${styles.card} ${soft ? styles.soft : ""}`} aria-labelledby={title ? headingId : undefined} data-home-block={blockName}>
    {title && <header className={styles.head}><FanHeading id={headingId}>{title}</FanHeading>{headAction && <Link className={styles.headLink} href={headAction.href as Route}>{headAction.label} <span aria-hidden="true">›</span></Link>}</header>}
    {items.length > 0 && <ul className={styles.rows}>
      {items.map(item => <li key={item.id} className={styles.row} data-row="notice">
        <Link className={styles.link} href={`${item.linkHref ?? `/notices/${item.slug}`}?locale=${locale}` as Route}>
          <span className={styles.category}>{homeNoticeCategoryLabels[locale][item.category]}</span>
          <span className={styles.title}>{item.title}</span>
          <time className={styles.date} dateTime={item.publishedAt}>{formatHomeNoticeDate(item.publishedAt, locale)}</time>
        </Link>
      </li>)}
    </ul>}
    {children}
    {footer && <Link className={styles.all} href={footer.href as Route}>{footer.label} <span aria-hidden="true">›</span></Link>}
  </section>;
}
