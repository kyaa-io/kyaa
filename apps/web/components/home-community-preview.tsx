"use client";

import { ProfileAuthor } from "@/features/group-social/profile-window";
import Link from "./fan-ui/hover-prefetch-link";
import { useState, useSyncExternalStore } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { paginationCopy } from "@/i18n/catalogs/common__pagination";
import { toContentLocale, type AppLocale } from "@/i18n/locales";
import { feedCopy } from "@/i18n/catalogs/features__fan_posts__feed";
import { contentCopy } from "@/i18n/catalogs/features__fan_posts__ui";
import { communityHref } from "@/features/community/domain/navigation";
import { popularPostsPageSchema, type PopularPost } from "@/features/popular-board/domain/popular-posts";
import { useCommunityResource } from "@/features/fanpage/ui/use-community-resource";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { mayHaveSession } from "@/features/auth/client/session-hint";
import { FanSectionHeader } from "./fan-ui/fan-heading";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanPostRow } from "./fan-ui/fan-post-row";
import { fanPostPageImage } from "./fan-ui/fan-post-page-image";
import type { PublishedCelebrity } from "@/server/content/content-domain";
import { FanSkeletonRows } from "./fan-ui/fan-skeleton";
import styles from "./home-community-preview.module.css";

const parse = (value: unknown) => popularPostsPageSchema.parse(value);
const noSubscribe = () => () => {};

const postHref = (post: PopularPost, locale: AppLocale) => post.source === "fan" ? `/c/${post.pageRef}/community/${post.id}?locale=${locale}&returnTo=${encodeURIComponent(`/?locale=${locale}`)}` : `/pages/groups/${post.pageRef}?locale=${locale}&tab=board&post=${post.id}`;
const boardHref = (post: PopularPost, locale: AppLocale) => post.source === "fan" ? communityHref(post.pageRef, locale) : `/pages/groups/${post.pageRef}?locale=${locale}&tab=board`;
/** Row thumbnails load straight from the public thumbnail routes; a failed load falls back to the row's text icon. */
const thumbnailSrc = (post: PopularPost) => post.asset ? post.source === "group" ? `/api/groups/media/${post.asset.id}?variant=thumbnail` : `/api/content-assets/${post.asset.id}?size=thumbnail` : null;

/** `celebrities` lets a row without a photo show its fan page image; a row of a page not in the list keeps the post icon. */
export function HomeCommunityPreview({ locale, celebrities = [] }: { locale: AppLocale; celebrities?: readonly Pick<PublishedCelebrity, "slug" | "image">[] }) {
  const [page, setPage] = useState(1);
  const pagination = paginationCopy(locale);
  const copy = contentCopy(locale), feed = feedCopy(locale);
  const url = `/api/public/popular-posts?locale=${toContentLocale(locale)}&page=${page}`;
  const auth = useByUsAuth(), signedIn = auth.ready && auth.authenticated;
  const hinted = useSyncExternalStore(noSubscribe, mayHaveSession, () => false);
  // 차단한 작성자는 회원 읽기에서만 빠진다. 회원일 수 있으면 공개 값을 읽지도 그리지도 않고 골격을 둔다.
  // 세션 표시가 없는 방문자만 인증 확인을 기다리지 않고 공개 값을 먼저 본다.
  const publicAllowed = auth.ready ? !auth.authenticated : !hinted;
  // [운영] 11/10 19:55: the current page stays in place while the next one loads (no collapse); arrows wait for it.
  const open = useCommunityResource(publicAllowed ? url : null, parse, true, true, true, true), viewer = useCommunityResource(signedIn ? url : null, parse, true, true, false, true);
  const { state, retry, pending } = signedIn ? viewer : open;
  const pageImageOf = (slug: string) => { const celebrity = celebrities.find(item => item.slug === slug); return celebrity ? fanPostPageImage({ slug, src: celebrity.image.url, photos: celebrity.image.photos, position: celebrity.image.position }) : undefined; };
  return <section className={styles.section} aria-labelledby="home-community-heading">
    <FanSectionHeader variant="editorial" id="home-community-heading" title={feed.fanBoard} />
    {state.status === "ready" && state.data.items.length > 0 ? <ul className={styles.rows} aria-busy={pending || undefined}>{state.data.items.map(post => <li key={`${post.source}:${post.id}`}>
      <FanPostRow density="home" locale={locale} href={postHref(post, locale)} title={post.title} thumbnail={thumbnailSrc(post)} pageImage={post.source === "fan" ? pageImageOf(post.pageRef) : undefined} commentCount={post.commentCount}
        source={{ label: post.pageName, href: boardHref(post, locale) }} author={<ProfileAuthor contentRef={{ kind: post.source === "fan" ? "fan_post" : "group_post", id: post.id }} nickname={post.nickname} avatarUrl={null}>{post.nickname}</ProfileAuthor>} time={post.createdAt} />
    </li>)}</ul> : state.status === "loading" ? <FanSkeletonRows rows={10} variant="post" ariaLabel={copy.loading} /> : <p className={styles.status} role={state.status === "error" ? "alert" : "status"}>{state.status === "error" ? copy.failed : copy.empty}</p>}
    {(page > 1 || (state.status === "ready" && state.data.hasMore)) && <nav className={styles.pagination} aria-label={feed.fanBoard}>
      <button type="button" disabled={page === 1 || pending} onClick={() => setPage(value => value - 1)} aria-label={pagination.previous}><ChevronLeft aria-hidden="true" /></button>
      <span aria-current="page" aria-live="polite">{new Intl.NumberFormat(locale).format(page)}</span>
      <button type="button" disabled={pending || state.status !== "ready" || !state.data.hasMore || page >= 1000} onClick={() => setPage(value => value + 1)} aria-label={pagination.next}><ChevronRight aria-hidden="true" /></button>
    </nav>}
    {state.status === "error" && <div className={styles.status}><FanAction variant="text" onClick={retry}>{copy.retry}</FanAction></div>}
    {state.status === "ready" && state.data.items.length === 0 && <Link className={styles.emptyAction} href={`/community?locale=${locale}`}>{feed.fanBoard}<span aria-hidden="true"> →</span></Link>}
  </section>;
}
