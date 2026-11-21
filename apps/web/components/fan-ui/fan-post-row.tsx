"use client";
import type { PublicAuthorTier } from "@/features/rewards/domain/public-author-tier";
import { AuthorTierBadge } from "@/features/rewards/ui/author-tier-badge";
import { visiblePostViews } from "@/components/fan-ui/post-view-count";
import { FileText, Heart, MessageCircle, Star } from "lucide-react";
import type { Route } from "next";
import Link from "./hover-prefetch-link";
import { useState, type ReactNode } from "react";

import { EditedMark } from "@/features/fan-posts/ui/edited-mark";
import type { AppLocale } from "@/i18n/locales";
import { NoticeCounts } from "./notice-counts";
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
  /** 글쓴이 프로필 사진. 첨부 사진이 없는 글의 왼쪽 칸에 둥글게 둔다. */
  avatar?: string | null;
  /** 글쓴이가 그 페이지의 인증 아티스트면 프로필 사진에 테두리를 두른다. */
  avatarArtist?: boolean;
  /** 첨부 사진도 프로필 사진도 없을 때 글 아이콘 대신 보이는 페이지 이미지. 없으면 글 아이콘. */
  pageImage?: ReactNode;
  notice?: boolean;
  commentCount?: number;
  /** 홈에서만 넘긴다. 누르면 그 페이지 게시판으로 간다. */
  source?: Readonly<{ label: string; href: string }>;
  author?: ReactNode;
  authorTier?: PublicAuthorTier;
  /** 인증 아티스트가 쓴 글이면 작성자 이름 옆에 태그를 둔다. */
  authorArtist?: boolean;
  time?: string | Date;
  edited?: boolean;
  views?: number | null;
  likes?: number | null;
  /** 그 페이지의 아티스트가 이 글에 좋아요나 댓글을 남겼으면 아티스트 이름. 제목 옆에 금색 별을 둔다. */
  reactedBy?: string;
  density?: "home" | "board";
  /** `compact`: 768 이상 열 폭을 줄인다(모임 Hot 목록). */
  columns?: "default" | "compact";
}>;

const KYAA_LOGO = "/kyaa-app-icon-192.png";
/** 게시판 목록 한 줄. 댓글·좋아요 수는 제목 옆(0이면 뺌). 값이 없는 열은 빼고 `—`를 쓰지 않는다. 왼쪽 칸은 첨부 사진 → 공지면 kyaa 로고 → 글쓴이 프로필 사진 → 페이지 이미지 → 글 아이콘 순이다. */
export function FanPostRow({ href, locale, title, thumbnail, avatar, avatarArtist = false, pageImage, notice = false, commentCount, source, author, authorTier, authorArtist = false, time, edited = false, views, likes, reactedBy, density = "board", columns = "default" }: FanPostRowProps) {
  const [broken, setBroken] = useState(false);
  const count = (value: number) => value.toLocaleString(locale);
  const timeLabel = time === undefined ? "" : fanPostTimeLabel(time);
  const photo = Boolean(thumbnail) && !broken;
  const isoTime = time === undefined ? undefined : time instanceof Date ? time.toISOString() : time;
  return <div className={styles.row} data-density={density} data-columns={columns === "compact" ? "compact" : undefined} data-notice={notice || undefined} data-fan-post-row>
    <span className={styles.thumb} data-thumb={photo ? "photo" : notice ? "logo" : avatar ? "avatar" : pageImage ? "page" : "icon"}>{photo
      ? <img src={thumbnail!} alt="" width={56} height={42} loading="lazy" decoding="async" onError={() => setBroken(true)} />
      : notice ? <img className={styles.logo} src={KYAA_LOGO} alt="" width={32} height={32} loading="lazy" decoding="async" />
      : avatar ? <img className={styles.avatar} data-artist-avatar={avatarArtist || undefined} src={avatar} alt="" width={32} height={32} loading="lazy" decoding="async" />
      : pageImage ?? <FileText size={16} aria-hidden="true" />}</span>
    <div className={styles.head}>
      {notice && <FanTag tone="notice">{fanUiText(locale, "noticeTag")}</FanTag>}
      <Link href={href as Route} className={styles.title}>{title}</Link>
      {reactedBy && <span className={styles.reacted} role="img" aria-label={fanUiText(locale, "artistReacted", [reactedBy])} data-artist-reacted><Star size={16} aria-hidden="true" /></span>}
      {!notice && commentCount !== undefined && commentCount > 0 && <span className={styles.count} aria-label={fanUiText(locale, "commentsLabel", [count(commentCount)])}><MessageCircle size={13} fill="currentColor" aria-hidden="true" />{count(commentCount)}</span>}
      {!notice && typeof likes === "number" && likes > 0 && <span className={styles.count} data-count="likes" aria-label={fanUiText(locale, "likesLabel", [count(likes)])}><Heart size={13} fill="currentColor" aria-hidden="true" />{count(likes)}</span>}
    </div>
    <div className={styles.meta}>
      {source && <Link href={source.href as Route} className={styles.source} title={source.label}>{source.label}</Link>}
      {author && <span className={styles.authorCell}><span className={styles.author} title={typeof author === "string" ? author : undefined}>{author}</span><AuthorTierBadge tier={authorTier} locale={locale} />{authorArtist && <FanTag tone="artist">{fanUiText(locale, "artistTag")}</FanTag>}</span>}
      {timeLabel && <time className={styles.time} dateTime={isoTime} suppressHydrationWarning>{timeLabel}</time>}
      {timeLabel && edited && <EditedMark locale={locale} />}
      {notice && <NoticeCounts locale={locale} views={views} comments={commentCount} likes={likes} />}
      {!notice && density === "board" && (typeof views === "number" && visiblePostViews(views, likes) !== undefined ? <span className={styles.number}>{fanUiText(locale, "viewsLabel", [count(views)])}</span> : <span className={styles.number} data-blank aria-hidden="true" />)}
    </div>
  </div>;
}
