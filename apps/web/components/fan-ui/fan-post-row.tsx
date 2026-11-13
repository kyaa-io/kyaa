"use client";
import { visiblePostViews } from "@/components/fan-ui/post-view-count";
import { FileText, Heart, MessageCircle, Star } from "lucide-react";
import type { Route } from "next";
import Link from "./hover-prefetch-link";
import { useState, type ReactNode } from "react";

import { EditedMark } from "@/features/fan-posts/ui/edited-mark";
import type { AppLocale } from "@/i18n/locales";
import { FanTag } from "./fan-tag";
import { fanUiText } from "./fan-ui-copy";
import styles from "./fan-post-row.module.css";

const pad = (value: number) => String(value).padStart(2, "0");
/** 오늘은 `HH:mm`, 그 밖은 `MM. DD.` */
export function fanPostTimeLabel(value: string | Date, now = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const today = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  return today ? `${pad(date.getHours())}:${pad(date.getMinutes())}` : `${pad(date.getMonth() + 1)}. ${pad(date.getDate())}.`;
}

export type FanPostRowProps = Readonly<{
  href: string;
  locale: AppLocale;
  title: string;
  thumbnail?: string | null;
  /** 사진이 없거나 불러오지 못할 때 글 아이콘 대신 보이는 페이지 이미지. 없으면 글 아이콘. */
  pageImage?: ReactNode;
  notice?: boolean;
  commentCount?: number;
  /** 홈에서만 넘긴다. 누르면 그 페이지 게시판으로 간다. */
  source?: Readonly<{ label: string; href: string }>;
  author?: ReactNode;
  /** 인증 아티스트가 쓴 글이면 작성자 이름 옆에 태그를 둔다. */
  authorArtist?: boolean;
  time?: string | Date;
  edited?: boolean;
  views?: number | null;
  likes?: number | null;
  /** 그 페이지의 아티스트가 이 글에 좋아요나 댓글을 남겼으면 아티스트 이름. 제목 옆에 금색 별을 둔다. */
  reactedBy?: string;
  density?: "home" | "board";
}>;

/** 게시판 목록 한 줄. 댓글·좋아요 수는 제목 옆(0이면 뺌). 값이 없는 열은 빼고 `—`를 쓰지 않는다. 사진이 없거나 깨지면 페이지 이미지를, 그것도 없으면 글 아이콘 칸을 둔다. */
export function FanPostRow({ href, locale, title, thumbnail, pageImage, notice = false, commentCount, source, author, authorArtist = false, time, edited = false, views, likes, reactedBy, density = "board" }: FanPostRowProps) {
  const [broken, setBroken] = useState(false);
  const count = (value: number) => value.toLocaleString(locale);
  const timeLabel = time === undefined ? "" : fanPostTimeLabel(time);
  const isoTime = time === undefined ? undefined : time instanceof Date ? time.toISOString() : time;
  return <div className={styles.row} data-density={density} data-notice={notice || undefined} data-fan-post-row>
    <span className={styles.thumb} data-page-image={(!thumbnail || broken) && pageImage ? "" : undefined}>{thumbnail && !broken
      ? <img src={thumbnail} alt="" width={56} height={42} loading="lazy" decoding="async" onError={() => setBroken(true)} />
      : pageImage ?? <FileText size={16} aria-hidden="true" />}</span>
    {notice && <FanTag tone="notice" className={styles.chip}>{fanUiText(locale, "noticeTag")}</FanTag>}
    <div className={styles.head}>
      <Link href={href as Route} className={styles.title}>{title}</Link>
      {reactedBy && <span className={styles.reacted} role="img" aria-label={fanUiText(locale, "artistReacted", [reactedBy])} data-artist-reacted><Star size={16} aria-hidden="true" /></span>}
      {commentCount !== undefined && commentCount > 0 && <span className={styles.count} aria-label={fanUiText(locale, "commentsLabel", [count(commentCount)])}><MessageCircle size={13} fill="currentColor" aria-hidden="true" />{count(commentCount)}</span>}
      {typeof likes === "number" && likes > 0 && <span className={styles.count} data-count="likes" aria-label={fanUiText(locale, "likesLabel", [count(likes)])}><Heart size={13} fill="currentColor" aria-hidden="true" />{count(likes)}</span>}
    </div>
    <div className={styles.meta}>
      {source && <Link href={source.href as Route} className={styles.source}>{source.label}</Link>}
      {author && <span className={styles.authorCell}><span className={styles.author}>{author}</span>{authorArtist && <FanTag tone="artist">{fanUiText(locale, "artistTag")}</FanTag>}</span>}
      {timeLabel && <time className={styles.time} dateTime={isoTime} suppressHydrationWarning>{timeLabel}</time>}
      {timeLabel && edited && <EditedMark locale={locale} />}
      {density === "board" && (typeof views === "number" && visiblePostViews(views, likes) !== undefined ? <span className={styles.number}>{fanUiText(locale, "viewsLabel", [count(views)])}</span> : <span className={styles.number} data-blank aria-hidden="true" />)}
    </div>
  </div>;
}
