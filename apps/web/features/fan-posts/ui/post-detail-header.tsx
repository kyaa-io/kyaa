"use client";
import type { ReactNode } from "react";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { fanUiText } from "@/components/fan-ui/fan-ui-copy";
import type { AppLocale } from "@/i18n/locales";
import styles from "./post-detail.module.css";

/** Stored time as a date and a clock, in the service's time zone. Readers need when it was written, not how long ago. */
export function postDateTimeLabel(value: string, locale: AppLocale) {
  return new Intl.DateTimeFormat(locale, { calendar: "gregory", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Seoul" }).format(new Date(value));
}

/** The shape of a post while it loads: the first answer to pressing a post or its comment link. */
export function PostDetailSkeleton() {
  return <section className={styles.skeleton} aria-busy="true"><FanSkeleton width={96} height={20} /><FanSkeleton width="60%" height={28} /><FanSkeleton width="80%" height={20} /><FanSkeleton shape="block" height={160} /><FanSkeleton shape="block" height={160} className={styles.skeletonComments} /></section>;
}

/** Top of a post, shared by the fan board and group boards: title, then author, date, views, likes and comments on one line. Two lines at 390. */
export function PostDetailHeader({ as: Title = "h1", tag, title, titleLang, author, avatarUrl, authorBadge, createdAt, viewCount, likeCount, commentCount, locale, menu }: { as?: "h1" | "h2"; tag?: ReactNode; title: string; titleLang?: string; author: ReactNode; avatarUrl?: string | null; authorBadge?: ReactNode; createdAt: string; viewCount?: number; likeCount: number; commentCount: number; locale: AppLocale; menu?: ReactNode }) {
  const count = (value: number) => value.toLocaleString(locale);
  return <header className={styles.header} data-post-detail-header="">
    <Title className={styles.title} lang={titleLang}>{tag && <span className={styles.titleTag}>{tag}</span>}{title}</Title>
    <div className={styles.metaRow}>
      <div className={styles.author}><img src={avatarUrl ?? "/images/avatars/star-pink.webp"} alt="" width={32} height={32} /><strong>{author}</strong>{authorBadge}</div>
      <div className={styles.facts}>
        <time dateTime={createdAt} suppressHydrationWarning>{postDateTimeLabel(createdAt, locale)}</time>
        {viewCount !== undefined && <span>{fanUiText(locale, "viewsLabel", [count(viewCount)])}</span>}
        <span>{fanUiText(locale, "likesLabel", [count(likeCount)])}</span>
        <span>{fanUiText(locale, "commentsLabel", [count(commentCount)])}</span>
      </div>
      {menu && <div className={styles.menu}>{menu}</div>}
    </div>
  </header>;
}
