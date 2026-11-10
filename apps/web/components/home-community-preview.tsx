"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ReactionCount, ReactionIcon } from "./fan-ui/reaction-count";
import { paginationCopy } from "@/i18n/catalogs/common__pagination";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { AuthenticatedMedia } from "@/features/content-safety/ui/authenticated-media";
import { waveMediaCopy } from "@/i18n/catalogs/features__fanpage__wave-media";
import { ContentAssetImage } from "@/features/content-safety/ui/content-asset";
import { toContentLocale, type AppLocale } from "@/i18n/locales";
import { feedCopy } from "@/i18n/catalogs/features__fan_posts__feed";
import { contentCopy } from "@/i18n/catalogs/features__fan_posts__ui";
import { communityHref } from "@/features/community/domain/navigation";
import { publicHomeFeedPageSchema } from "@/features/fan-posts/domain/home-feed";
import { useCommunityResource } from "@/features/fanpage/ui/use-community-resource";
import { FanSectionHeader } from "./fan-ui/fan-heading";
import { FanSkeleton } from "./fan-ui/fan-skeleton";
import styles from "./home-community-preview.module.css";

const parse = (value: unknown) => {
  const data = publicHomeFeedPageSchema.parse(value);
  return { ...data, items: data.items.sort((a, b) =>
    Number(b.item.kind === "fan_post" && (b.item.assets.length > 0 || !!b.item.video)) -
    Number(a.item.kind === "fan_post" && (a.item.assets.length > 0 || !!a.item.video)) ||
    Date.parse(b.item.createdAt) - Date.parse(a.item.createdAt)) };
};

/** The public home feed returns 10 posts a page; the first-load skeleton takes the same height. */
const HOME_FEED_PAGE_SIZE = 10;

export function HomeCommunityPreview({ locale }: { locale: AppLocale }) {
  const auth = useByUsAuth();
  const [page, setPage] = useState(1);
  const pagination = paginationCopy(locale);
  const copy = contentCopy(locale), feed = feedCopy(locale);
  // The current page stays in place while the next one loads (no collapse); arrows wait for it.
  const { state, retry, pending } = useCommunityResource(`/api/public/home-feed?locale=${toContentLocale(locale)}&page=${page}`, parse, true, true, true);
  return <section className={styles.section} aria-labelledby="home-community-heading">
    <FanSectionHeader variant="editorial" id="home-community-heading" title={feed.fanBoard} />
    {state.status === "loading" ? <ul className={`${styles.posts} ${styles.skeletonList}`} aria-busy="true" aria-label={copy.loading}>{Array.from({ length: HOME_FEED_PAGE_SIZE }, (_, index) => <li key={index} data-skeleton-card=""><div className={styles.post}><span className={styles.media}><FanSkeleton shape="block" width="100%" height="100%" /></span><span className={styles.postLink}><FanSkeleton width="40%" height={13} /><FanSkeleton width="80%" height={18} className={styles.skeletonTitle} /><FanSkeleton width="55%" height={13} className={styles.skeletonMeta} /></span></div></li>)}</ul>
    : state.status === "ready" && state.data.items.length > 0 ? <ul className={styles.posts} aria-busy={pending || undefined}>{state.data.items.map(({ creatorSlug, creatorName, item }) => <li key={`${creatorSlug}:${item.kind}:${item.id}`}>
      <div className={styles.post}>
      {item.kind === "fan_post" && item.video && <div className={styles.media}><Link href={communityHref(creatorSlug, locale)} aria-label={waveMediaCopy(locale).play}>{auth.authenticated ? <AuthenticatedMedia asset={{ ...item.video, kind: "video" }} locale={locale} alt={waveMediaCopy(locale).play} retryable={false} /> : <span>{waveMediaCopy(locale).play} →</span>}</Link></div>}
      {item.kind === "fan_post" && !item.video && item.assets[0] && <div className={styles.media}><ContentAssetImage asset={item.assets[0]} locale={locale} alt={copy.photo} href={communityHref(creatorSlug, locale)} loading="lazy" thumbnail /></div>}
      <Link className={styles.postLink} href={communityHref(creatorSlug, locale)}>
        <span className={styles.board}>{creatorName} · {feed.fanBoard}</span>
        <p>{item.body || feed.fanBoard}</p>
        <div className={styles.meta}><span>{item.kind === "cheer" ? item.nickname : item.author.nickname}</span><time dateTime={item.createdAt}>{new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "Asia/Seoul" }).format(new Date(item.createdAt))}</time><span className={styles.reactions}><span role="img" aria-label={`${copy.like} ${(item.kind === "cheer" ? item.clapCount : item.likeCount).toLocaleString(locale)}`}><ReactionIcon kind="like" size={14} /><ReactionCount value={item.kind === "cheer" ? item.clapCount : item.likeCount} locale={locale} /></span><span role="img" aria-label={`${copy.comments} ${(item.kind === "cheer" ? item.replyCount : item.commentCount).toLocaleString(locale)}`}><ReactionIcon kind="comment" size={14} /><ReactionCount value={item.kind === "cheer" ? item.replyCount : item.commentCount} locale={locale} /></span></span></div>
      </Link></div>
    </li>)}</ul> : <p className={styles.status} role={state.status === "error" ? "alert" : "status"}>{state.status === "error" ? copy.failed : copy.empty}</p>}
    {(page > 1 || (state.status === "ready" && state.data.hasMore)) && <nav className={styles.pagination} aria-label={feed.fanBoard}>
      <button type="button" disabled={page === 1 || pending} onClick={() => setPage(value => value - 1)} aria-label={pagination.previous}><ChevronLeft aria-hidden="true" /></button>
      <span aria-current="page" aria-live="polite">{new Intl.NumberFormat(locale).format(page)}</span>
      <button type="button" disabled={pending || state.status !== "ready" || !state.data.hasMore || page >= 1000} onClick={() => setPage(value => value + 1)} aria-label={pagination.next}><ChevronRight aria-hidden="true" /></button>
    </nav>}
    {state.status === "error" && <div className={styles.status}><button type="button" onClick={retry}>{copy.retry}</button></div>}
    {state.status === "ready" && state.data.items.length === 0 && <Link className={styles.emptyAction} href={`/community?locale=${locale}`}>{feed.fanBoard}<span aria-hidden="true"> →</span></Link>}
  </section>;
}
