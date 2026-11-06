"use client";
import { FileText } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";

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
  notice?: boolean;
  commentCount?: number;
  /** 홈에서만 넘긴다. 누르면 그 페이지 게시판으로 간다. */
  source?: Readonly<{ label: string; href: string }>;
  author?: string;
  /** 인증 아티스트가 쓴 글이면 작성자 이름 옆에 태그를 둔다. */
  authorArtist?: boolean;
  time?: string | Date;
  views?: number | null;
  likes?: number | null;
  density?: "home" | "board";
}>;

/** 게시판 목록 한 줄. 값이 없는 열은 빼고 `—`를 쓰지 않는다. 사진이 없거나 깨지면 글 아이콘 칸을 둔다. */
export function FanPostRow({ href, locale, title, thumbnail, notice = false, commentCount, source, author, authorArtist = false, time, views, likes, density = "board" }: FanPostRowProps) {
  const [broken, setBroken] = useState(false);
  const count = (value: number) => value.toLocaleString(locale);
  const timeLabel = time === undefined ? "" : fanPostTimeLabel(time);
  const isoTime = time === undefined ? undefined : time instanceof Date ? time.toISOString() : time;
  return <div className={styles.row} data-density={density} data-notice={notice || undefined} data-fan-post-row>
    <span className={styles.thumb}>{thumbnail && !broken
      ? <img src={thumbnail} alt="" width={56} height={42} loading="lazy" decoding="async" onError={() => setBroken(true)} />
      : <FileText size={16} aria-hidden="true" />}</span>
    <div className={styles.head}>
      {notice && <FanTag tone="notice">{fanUiText(locale, "noticeTag")}</FanTag>}
      <Link href={href as Route} className={styles.title}>{title}</Link>
      {commentCount !== undefined && commentCount > 0 && <span className={styles.comments} aria-label={fanUiText(locale, "commentsLabel", [count(commentCount)])}>[{count(commentCount)}]</span>}
    </div>
    <div className={styles.meta}>
      {source && <Link href={source.href as Route} className={styles.source}>{source.label}</Link>}
      {author && <span className={styles.author}>{author}</span>}
      {author && authorArtist && <FanTag tone="artist">{fanUiText(locale, "artistTag")}</FanTag>}
      {timeLabel && <time dateTime={isoTime} suppressHydrationWarning>{timeLabel}</time>}
      {density === "board" && typeof views === "number" && <span className={styles.number} aria-label={fanUiText(locale, "viewsLabel", [count(views)])}>{count(views)}</span>}
      {density === "board" && typeof likes === "number" && <span className={styles.number} aria-label={fanUiText(locale, "likesLabel", [count(likes)])}>{count(likes)}</span>}
    </div>
  </div>;
}
