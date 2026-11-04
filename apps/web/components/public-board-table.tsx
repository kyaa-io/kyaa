"use client";

import Link from "next/link";
import type { Route } from "next";
import { ContentAssetImage } from "@/features/content-safety/ui/content-asset";
import { RelativeTime } from "@/components/relative-time";
import { boardCopy } from "@/features/groups/ui/board-copy";
import { creatorAsideCopy } from "@/features/groups/ui/creator-aside-copy";
import { managementCopy } from "@/features/groups/ui/management-copy";
import { communityHref } from "@/features/community/domain/navigation";
import type { PopularPost } from "@/features/popular-board/domain/popular-posts";
import type { AppLocale } from "@/i18n/locales";
import styles from "./public-board-table.module.css";

function postHref(post: PopularPost, locale: AppLocale): Route {
  if (post.source === "fan") return communityHref(post.pageRef, locale);
  const href: string = `/pages/groups/${post.pageRef}?locale=${locale}&tab=board&post=${post.id}`;
  return href as Route;
}

export function PublicBoardTable({ posts, locale, photoLabel }: { posts: readonly PopularPost[]; locale: AppLocale; photoLabel: string }) {
  const b = boardCopy(locale), columns = creatorAsideCopy(locale), m = managementCopy(locale);
  return <div className={styles.table}>
    <div className={styles.head} aria-hidden="true"><span>{m.title}</span><span>{columns.author}</span><span>{columns.date}</span><span>{b.views}</span><span>{b.like}</span></div>
    <ul className={styles.rows}>{posts.map(post => <li key={`${post.source}:${post.id}`}>
      <Link className={styles.row} href={postHref(post, locale)}>
        <span className={styles.main}>
          {post.asset && <span className={styles.thumb}><ContentAssetImage asset={post.asset} locale={locale} alt={photoLabel} loading="lazy" thumbnail groupMedia={post.source === "group"} /></span>}
          <span className={styles.text}>
            <strong title={post.title}>{post.title}{post.commentCount > 0 ? ` (${post.commentCount.toLocaleString(locale)})` : ""}</strong>
            <span className={styles.page}>{post.pageName}</span>
          </span>
        </span>
        <span className={styles.cell}>{post.nickname}</span>
        <RelativeTime className={styles.cell} value={post.createdAt} locale={locale} absolute={(v, l) => new Date(v).toLocaleDateString(l)} />
        <span className={`${styles.cell} ${styles.count}`}>{post.viewCount === null ? "—" : post.viewCount.toLocaleString(locale)}</span>
        <span className={`${styles.cell} ${styles.count}`}>{post.likeCount.toLocaleString(locale)}</span>
      </Link>
    </li>)}</ul>
  </div>;
}
