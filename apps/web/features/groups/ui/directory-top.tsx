"use client";
/**
 * 모임 디렉터리 상단 세 블록(plan-ux-r8 G1·G2·얇은 배너, 사용자 2026-11-09 11:02 순서).
 * 내 아티스트: /api/groups?mine=joined&sort=visited&limit=10. Hot 게시글: /api/public/popular-posts?page=1(좋아요 → 댓글 → 최신).
 * 새 글 점은 응답에 마지막 방문 뒤 새 글 정보가 없어 그리지 않는다.
 */
import type { Route } from "next";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { ChevronLeft, ChevronRight } from "@/components/icons";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { Plus } from "@/components/fan-ui/fan-icons";
import { CreatorAvatar } from "@/components/fan-ui/creator-avatar";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { FanState } from "@/components/fan-ui/fan-state";
import { fanLoginHref } from "@/components/login-href";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { mayHaveSession } from "@/features/auth/client/session-hint";
import { useCommunityResource } from "@/features/fanpage/ui/use-community-resource";
import { localizedBannerHref, type HomeBanner } from "@/features/home/domain/home-banner";
import { popularPostsPageSchema, type PopularPost } from "@/features/popular-board/domain/popular-posts";
import { toContentLocale, type AppLocale } from "@/i18n/locales";
import { groupApiQuery, groupHref, groupListSchema } from "../domain/contracts";
import { directoryTopCopy } from "./directory-top-copy";
import { useGroupResource } from "./use-group-resource";
import styles from "./directory-top.module.css";

const parseList = (value: unknown) => groupListSchema.parse(value);
const parsePosts = (value: unknown) => popularPostsPageSchema.parse(value);
const noSubscribe = () => () => {};
const ROWS = 5;
const SLOTS = 3;

function focusDirectorySearch() {
  const input = document.querySelector<HTMLInputElement>("[data-directory-explore] input");
  input?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  input?.focus({ preventScroll: true });
}

/** 첫 칸 `+`는 로그인 여부와 관계없이 모임 찾기. 가입한 모임이 없으면 흐린 원 세 개가 같은 자리를 채운다. */
export function MyArtists({ locale, loginPath }: { locale: AppLocale; loginPath: string }) {
  const c = directoryTopCopy(locale);
  const resource = useGroupResource(groupApiQuery({ type: "all" }), parseList);
  const joined = useGroupResource(resource.ready && resource.authenticated ? groupApiQuery({ mine: "joined", sort: "visited", limit: "10" }) : null, parseList);
  const guest = resource.ready && !resource.authenticated;
  const items = joined.data?.items ?? [];
  const waiting = !resource.ready || (resource.authenticated && joined.loading && !joined.data);
  return <section className={styles.card} aria-labelledby="directory-my-artists" data-directory-block="my-artists">
    <FanHeading id="directory-my-artists" as="h2">{c.myArtists}</FanHeading>
    <div className={styles.artistRow}>
      <ul className={styles.rail}>
        <li className={styles.slot} data-row="artist-add"><a className={styles.add} href="#directory-explore" onClick={(event) => { event.preventDefault(); focusDirectorySearch(); }} aria-label={c.findGroups}><FanIcon icon={Plus} size={24} /></a><span className={styles.slotName} aria-hidden="true" /></li>
        {waiting ? Array.from({ length: SLOTS + 1 }, (_, i) => <li key={i} className={styles.slot} data-row="artist-loading" aria-hidden="true"><FanSkeleton shape="circle" width={64} height={64} /><FanSkeleton width={48} height={12} /></li>)
          : guest || joined.error || items.length === 0 ? Array.from({ length: SLOTS }, (_, i) => <li key={i} className={styles.slot} data-row="artist-ghost" aria-hidden="true"><span className={styles.ghost} /><span className={styles.ghostName} /></li>)
          : items.map((page) => <li key={page.id} className={styles.slot} data-row="artist">
            <Link className={styles.artist} href={groupHref(page, locale) as Route}>
              {page.slug ? <CreatorAvatar slug={page.slug} src={page.imageUrl} size={64} photos={undefined} /> : <span className={styles.ghost} />}
              <span className={styles.slotName}>{page.name}</span>
            </Link>
          </li>)}
      </ul>
      {guest ? <FanAction className={styles.login} variant="neutral" href={fanLoginHref(locale, loginPath)}>{c.signIn}</FanAction> : null}
    </div>
  </section>;
}

const postHref = (post: PopularPost, locale: AppLocale) => post.source === "fan" ? `/c/${post.pageRef}/community/${post.id}?locale=${locale}` : `/pages/groups/${post.pageRef}?locale=${locale}&tab=board&post=${post.id}`;
const pageHref = (post: PopularPost, locale: AppLocale) => post.source === "fan" ? `/${post.pageRef}?locale=${locale}` : `/pages/groups/${post.pageRef}?locale=${locale}`;
const firstLine = (title: string) => title.split("\n").map((line) => line.trim()).find(Boolean) ?? title;

/** 다섯 줄 고정(0건이면 첫 줄이 "아직 Hot 게시글 없음"). 펼치면 받아 둔 열 줄까지, 새 요청은 없다. */
export function HotPosts({ locale }: { locale: AppLocale }) {
  const c = directoryTopCopy(locale);
  const [open, setOpen] = useState(false);
  const url = `/api/public/popular-posts?locale=${toContentLocale(locale)}&page=1`;
  const auth = useByUsAuth(), signedIn = auth.ready && auth.authenticated;
  const hinted = useSyncExternalStore(noSubscribe, mayHaveSession, () => false);
  const publicAllowed = auth.ready ? !auth.authenticated : !hinted;
  const anonymous = useCommunityResource(publicAllowed ? url : null, parsePosts, true, true, true), viewer = useCommunityResource(signedIn ? url : null, parsePosts, true, true);
  const { state, retry } = signedIn ? viewer : anonymous;
  const ready = state.status === "ready";
  const total = ready ? state.data.items.length : 0;
  const items = ready ? state.data.items.slice(0, open ? 10 : ROWS) : [];
  return <section className={styles.hot} aria-labelledby="directory-hot-posts" data-directory-block="hot-posts">
    <div className={styles.hotHead}><FanHeading id="directory-hot-posts">{c.hotTitle}</FanHeading><span className={styles.hotSub}>{c.hotSub}</span></div>
    {state.status === "error" ? <div className={styles.state}><FanState inline compact kind="error" title={c.hotError} actions={<FanAction variant="text" size="sm" onClick={retry}>{c.retry}</FanAction>} /></div>
      : <ul className={styles.posts}>{!ready ? Array.from({ length: ROWS }, (_, i) => <li key={i} className={styles.post} data-row="hot-loading" aria-hidden="true"><FanSkeleton shape="circle" width={32} height={32} /><FanSkeleton width="70%" height={16} /><FanSkeleton width="40%" height={12} /></li>)
        : <>{items.map((post) => <li key={`${post.source}:${post.id}`} className={styles.post} data-row="hot-post">
          <CreatorAvatar slug={post.pageRef} src={null} size={32} photos={undefined} />
          <Link className={styles.postTitle} href={postHref(post, locale) as Route}>{firstLine(post.title)}</Link>
          <span className={styles.postMeta}><Link href={pageHref(post, locale) as Route}>{post.pageName}</Link><span aria-hidden="true">·</span><span>{c.likes(post.likeCount)}</span><span aria-hidden="true">·</span><span>{c.comments(post.commentCount)}</span></span>
        </li>)}{Array.from({ length: Math.max(0, ROWS - items.length) }, (_, i) => {
          const note = total === 0 && i === 0;
          return <li key={`p${i}`} className={styles.post} data-row="hot-placeholder" aria-hidden={note ? undefined : true}><span className={styles.ghostSmall} /><span className={styles.placeholderText}>{note ? c.hotEmpty : "—"}</span></li>;
        })}</>}</ul>}
    {state.status === "error" ? null : <div className={styles.more}><FanAction variant="neutral" disabled={total <= ROWS} aria-expanded={open} onClick={() => setOpen((value) => !value)}>{open ? c.collapse : c.expand}</FanAction></div>}
  </section>;
}

/** 띠 그림(가로가 세로의 8배 넘는 원본, 716×180·2720×240)이 있으면 꽉 채우고, 아니면 흰 바탕에 썸네일과 제목. */
const isStrip = (banner: HomeBanner) => banner.desktopImage.width / banner.desktopImage.height >= 8;

export function ThinCarousel({ banners, locale }: { banners: readonly HomeBanner[]; locale: AppLocale }) {
  const c = directoryTopCopy(locale);
  const [index, setIndex] = useState(0);
  if (!banners.length) return null;
  const banner = banners[index % banners.length]!;
  const mobile = banner.mobileImage ?? banner.desktopImage;
  const href = localizedBannerHref(banner.href, locale);
  const fill = isStrip(banner);
  const move = (step: number) => setIndex((value) => (value + step + banners.length) % banners.length);
  return <section className={styles.thin} data-fill={fill || undefined} aria-roledescription="carousel" aria-label={c.bannerLabel} data-directory-block="thin-banner">
    {fill
      ? <a className={styles.thinFull} href={href} aria-label={banner.title}>
        <picture><source media="(min-width: 64rem)" srcSet={banner.desktopImage.url} width={banner.desktopImage.width} height={banner.desktopImage.height} /><img src={mobile.url} width={mobile.width} height={mobile.height} alt="" /></picture>
      </a>
      : <a className={styles.thinSlide} href={href}>
        <picture className={styles.thinImage}><source media="(min-width: 64rem)" srcSet={banner.desktopImage.url} width={banner.desktopImage.width} height={banner.desktopImage.height} /><img src={mobile.url} width={mobile.width} height={mobile.height} alt="" /></picture>
        <span className={styles.thinCopy}><span className={styles.thinTitle}>{banner.title}</span><span className={styles.thinAction}>{banner.ctaLabel}</span></span>
      </a>}
    {banners.length > 1 ? <div className={styles.thinControls}>
      <FanAction variant="text" size="sm" ariaLabel={c.previousBanner} onClick={() => move(-1)} leadingIcon={<ChevronLeft aria-hidden="true" />} />
      <span aria-live="polite">{index + 1}/{banners.length}</span>
      <FanAction variant="text" size="sm" ariaLabel={c.nextBanner} onClick={() => move(1)} leadingIcon={<ChevronRight aria-hidden="true" />} />
    </div> : null}
  </section>;
}
