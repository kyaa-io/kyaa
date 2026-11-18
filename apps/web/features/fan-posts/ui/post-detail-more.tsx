"use client";
import { FanAction } from "@/components/fan-ui/fan-action";
import { ReactionCount, ReactionIcon } from "@/components/fan-ui/reaction-count";
import { FanTabs } from "@/components/fan-ui/fan-tabs";
import { FanText } from "@/components/fan-ui/fan-text";
import Link from "../../../components/fan-ui/hover-prefetch-link";
import type { Route } from "next";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { BookOpen } from "@/components/fan-ui/fan-icons";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { z } from "zod";
import { BannerSlot } from "@/components/banner-slot/banner-slot";
import { useCommunityResource } from "@/features/fanpage/ui/use-community-resource";
import { boardHref } from "@/features/fanpage/domain/board-navigation";
import { contentCopy } from "@/i18n/catalogs/features__fan_posts__ui";
import { toContentLocale, type AppLocale } from "@/i18n/locales";
import { postPageSchema, postSchema, type FanPost } from "../domain/content";
import { postSlotTexts } from "../domain/post-title-slots";
import styles from "./post-detail-more.module.css";

type Item = FanPost;
type Tab = "popular" | "latest";

/** 레일에 늘 같은 행 수 높이를 둔다. 글이 적으면 남는 칸은 막대 없는 빈 줄이라 블록 높이가 데이터 수를 따라 바뀌지 않는다(막대는 불러오는 중에만). */
export const MORE_ROWS = 5;

const labels: Record<AppLocale, readonly [string, string, string]> = {
  ko: ["이 페이지의 다른 글", "인기", "최신"],
  en: ["More from this page", "Popular", "Latest"],
  ja: ["このページの他の投稿", "人気", "新着"],
  "zh-Hans": ["此页面的其他帖子", "热门", "最新"],
  "zh-Hant": ["此頁面的其他貼文", "熱門", "最新"],
  es: ["Más de esta página", "Populares", "Recientes"],
  id: ["Lainnya dari halaman ini", "Populer", "Terbaru"],
  vi: ["Bài khác của trang này", "Phổ biến", "Mới nhất"],
  th: ["โพสต์อื่นในหน้านี้", "ยอดนิยม", "ล่าสุด"],
  pt: ["Mais desta página", "Populares", "Recentes"],
  fr: ["Plus de cette page", "Populaires", "Récents"],
  ru: ["Ещё на этой странице", "Популярное", "Новое"],
};

export const parseMore = (value: unknown) => typeof value === "object" && value !== null && "nextCursor" in value
  ? postPageSchema.parse(value)
  : { ...z.object({ items: z.array(postSchema).max(10) }).parse(value), nextCursor: null };

/** 글의 제목 칸, 없으면 본문 첫 줄. 번역하지 않은 원문이다. */
export function moreTitle(item: Pick<Item, "body">) {
  const [title, article] = postSlotTexts(item.body);
  return (title || article || item.body).split("\n")[0].trim();
}
/** 공개 글의 첫 사진만 바로 읽는다. 사진이 표시될 때까지 공통 글 아이콘으로 대체한다. */
const thumbnailOf = (item: Item) => item.visibility === "public" && item.assets?.[0] ? `/api/content-assets/${item.assets[0].id}?size=thumbnail` : null;

function MoreThumbnail({ src }: { src: string | null }) {
  const [loaded, setLoaded] = useState(false);
  return <span className={styles.thumb}>
    {loaded ? null : <FanIcon icon={BookOpen} size={16} />}
    {src && <img src={src} alt="" width={64} height={48} loading="lazy" decoding="async"
      onLoad={() => setLoaded(true)} onError={() => setLoaded(false)} data-loaded={loaded} />}
  </span>;
}

function MoreRow({ item, slug, locale, tab }: { item: Item; slug: string; locale: AppLocale; tab: Tab }) {
  const thumbnail = thumbnailOf(item);
  const copy = contentCopy(locale);
  const returnTo = boardHref(slug, locale);
  const href = `/c/${slug}/community/${item.id}?locale=${locale}&returnTo=${encodeURIComponent(returnTo)}${tab === "latest" ? "&more=latest" : ""}`;
  return <li data-row=""><Link className={styles.row} href={href as Route} data-post-more-row="">
    <MoreThumbnail key={thumbnail} src={thumbnail} />
    <span className={styles.text}>
      <FanText role="row-title" className={styles.title}>{moreTitle(item)}</FanText>
      {/* 0은 그리지 않는다. 둘 다 0이면 숫자 줄이 없다(게시판 목록의 댓글 수와 같은 규칙). */}
      {(item.likeCount > 0 || item.commentCount > 0) && <FanText role="meta" className={styles.meta}>
        {item.likeCount > 0 && <span><ReactionIcon kind="like" /><span className={styles.srOnly}>{copy.like} </span><ReactionCount value={item.likeCount} locale={locale} /></span>}
        {item.commentCount > 0 && <span><ReactionIcon kind="comment" /><span className={styles.srOnly}>{copy.comments} </span><ReactionCount value={item.commentCount} locale={locale} /></span>}
      </FanText>}
    </span>
  </Link></li>;
}

/**
 * 글 상세 옆(1024 미만에서는 본문 아래) '이 페이지의 다른 글'. 같은 페이지의 인기·최신 팬 글을 읽는 사람의 권한 그대로 받아
 * 지금 글을 빼고 다섯 개를 보인다. 그 아래 팬페이지 관리 배너 자리(브랜드 페이지는 없음)는 배너가 없으면 아무것도 그리지 않는다.
 */
type MoreProps = { slug: string; postId: string; locale: AppLocale; banner?: boolean };

export function PostDetailMore(props: MoreProps) {
  const tab = useSearchParams().get("more") === "latest" ? "latest" : "popular";
  return <MoreList key={`${props.slug}:${props.postId}:${props.locale}`} {...props} tab={tab} />;
}

function MoreList({ slug, postId, locale, banner = true, tab }: MoreProps & { tab: Tab }) {
  const [offset, setOffset] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [title, popularLabel, latestLabel] = labels[locale], copy = contentCopy(locale), contentLocale = toContentLocale(locale);
  const query = new URLSearchParams({ locale: contentLocale, limit: String(MORE_ROWS), exclude: postId });
  if (cursor) query.set("cursor", cursor);
  const base = `/api/celebrities/${encodeURIComponent(slug)}`;
  const url = tab === "popular" ? `${base}/popular-posts?period=week&locale=${contentLocale}` : `${base}/posts?${query}`;
  const resource = useCommunityResource(url, parseMore);
  const data = resource.state.status === "ready" ? resource.state.data : null;
  const eligible = data?.items.filter(item => item.id !== postId) ?? [];
  const start = offset >= eligible.length ? 0 : offset;
  const items = eligible.slice(start, start + MORE_ROWS);
  const nextCursor = data?.nextCursor;
  const hasMore = tab === "popular" ? eligible.length > start + MORE_ROWS : Boolean(nextCursor);
  function selectTab(next: Tab) {
    if (next === tab) return;
    setOffset(0);
    setCursor(null);
    const url = new URL(window.location.href);
    if (next === "latest") url.searchParams.set("more", "latest");
    else url.searchParams.delete("more");
    window.history.replaceState(null, "", url);
  }
  return <aside className={styles.rail} data-post-detail-more="">
    <section className={styles.panel} aria-labelledby={`post-more-${postId}`}>
      <header><FanText role="item" as="strong" id={`post-more-${postId}`}>{title}</FanText><FanTabs variant="segment" label={title} current={tab} className={styles.tabs} items={[{ key: "popular", label: popularLabel, onSelect: () => selectTab("popular") }, { key: "latest", label: latestLabel, onSelect: () => selectTab("latest") }]} /></header>
      {resource.state.status === "ready"
        ? <ul className={styles.list}>{items.map(item => <MoreRow key={item.id} item={item} slug={slug} locale={locale} tab={tab} />)}{Array.from({ length: MORE_ROWS - items.length }, (_, index) => <li key={`blank-${index}`} data-row="" className={styles.empty} aria-hidden="true" />)}</ul>
        : resource.state.status === "error"
          ? <div role="status" className={styles.failed}><FanText role="meta">{copy.failed}</FanText><FanAction variant="neutral" onClick={resource.retry}>{copy.retry}</FanAction></div>
          : <ul className={styles.list} aria-busy="true">{Array.from({ length: MORE_ROWS }, (_, index) => <li key={index} data-row="" className={styles.blank}><FanSkeleton shape="block" className={styles.thumb} /><span className={styles.text}><FanSkeleton /><FanSkeleton /></span></li>)}</ul>}
      <div className={styles.pagination}>{hasMore && <FanAction variant="neutral" onClick={() => {
        if (tab === "popular") setOffset(start + MORE_ROWS);
        else if (nextCursor) setCursor(nextCursor);
      }}>{copy.more}</FanAction>}</div>
    </section>
    {banner && <BannerSlot slot="fanpage_second" locale={locale} />}
  </aside>;
}
