"use client";
/**
 * 모임 디렉터리 상단 세 블록(plan-ux-r8 G1·G2·얇은 배너, 사용자 2026-11-09 11:02 순서).
 * 내 아티스트: /api/groups?mine=joined&sort=visited&limit=10. Hot 게시글: /api/public/popular-posts?page=1(좋아요 → 댓글 → 최신).
 * 새 글 점은 응답에 마지막 방문 뒤 새 글 정보가 없어 그리지 않는다.
 */
import type { Route } from "next";
import { FanMenu } from "@/components/fan-ui/fan-menu";
import { FanIconButton } from "@/components/fan-ui/fan-icon-button";
import Link from "next/link";
import { useRef, useState, useSyncExternalStore, type PointerEvent, type MouseEvent, type DragEvent } from "react";
import { ChevronLeft, ChevronRight } from "@/components/icons";
import { ChevronDown } from "@/components/fan-ui/fan-icons";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { Plus } from "@/components/fan-ui/fan-icons";
import { CreatorAvatar } from "@/components/fan-ui/creator-avatar";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { FanPostRow } from "@/components/fan-ui/fan-post-row";
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
import { useGroupRequest, useGroupResource } from "./use-group-resource";
import styles from "./directory-top.module.css";

const parseList = (value: unknown) => groupListSchema.parse(value);
const parsePosts = (value: unknown) => popularPostsPageSchema.parse(value);
const noSubscribe = () => () => {};
const ROWS = 5;
const SLOTS = 3;

function useHorizontalDrag<T extends HTMLElement>(mode: "rail" | "banner", onSwipe?: (step: number) => void) {
  const drag = useRef<{ x: number; y: number; left: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  return {
    onPointerDown: (event: PointerEvent<T>) => {
      if (event.button !== 0 || (mode === "rail" && event.pointerType !== "mouse")) return;
      suppressClick.current = false;
      drag.current = { x: event.clientX, y: event.clientY, left: event.currentTarget.scrollLeft, moved: false };
    },
    onPointerMove: (event: PointerEvent<T>) => {
      const state = drag.current;
      if (!state) return;
      const dx = event.clientX - state.x, dy = event.clientY - state.y;
      if (!state.moved && (Math.abs(dx) <= 8 || Math.abs(dx) <= Math.abs(dy))) return;
      if (!state.moved) event.currentTarget.setPointerCapture?.(event.pointerId);
      state.moved = true;
      if (mode === "rail") { event.preventDefault(); event.currentTarget.scrollLeft = state.left - dx; }
    },
    onPointerUp: (event: PointerEvent<T>) => {
      const state = drag.current;
      if (!state) return;
      const dx = event.clientX - state.x;
      suppressClick.current = state.moved;
      if (mode === "banner" && state.moved && Math.abs(dx) >= 40) onSwipe?.(dx < 0 ? 1 : -1);
      drag.current = null;
    },
    onPointerCancel: () => { drag.current = null; },
    onClickCapture: (event: MouseEvent<T>) => { if (suppressClick.current && event.detail !== 0) { event.preventDefault(); event.stopPropagation(); } suppressClick.current = false; },
    onDragStart: (event: DragEvent<T>) => event.preventDefault(),
  };
}

function focusDirectorySearch() {
  const input = document.querySelector<HTMLInputElement>("[data-directory-explore] input");
  input?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  input?.focus({ preventScroll: true });
}

/** 첫 칸 `+`는 로그인 여부와 관계없이 모임 찾기. 가입한 모임이 없으면 흐린 원 세 개가 같은 자리를 채운다.
 * 비로그인의 로그인 버튼은 제목 줄에 둔다: 원 네 개(+ 포함)가 390·360에서도 잘리지 않고 한 줄에 들어가야 한다. */
export function MyArtists({ locale, loginPath }: { locale: AppLocale; loginPath: string }) {
  const c = directoryTopCopy(locale);
  const drag = useHorizontalDrag<HTMLUListElement>("rail");
  const session = useGroupRequest();
  const joined = useGroupResource(session.ready && session.authenticated ? groupApiQuery({ mine: "joined", sort: "visited", limit: "10" }) : null, parseList);
  const guest = session.ready && !session.authenticated;
  const items = joined.data?.items ?? [];
  const waiting = !session.ready || (session.authenticated && joined.loading && !joined.data);
  const ghost = !waiting && (guest || joined.error || items.length === 0);
  return <section className={styles.card} aria-labelledby="directory-my-artists" data-directory-block="my-artists">
    <div className={styles.cardHead}>
      <FanHeading id="directory-my-artists" as="h2">{c.myArtists}</FanHeading>
      {guest ? <FanAction className={styles.login} variant="neutral" size="sm" href={fanLoginHref(locale, loginPath)}>{c.signIn}</FanAction> : null}
    </div>
    <ul className={styles.rail} data-ghost={ghost || undefined} {...drag}>
      <li className={styles.slot} data-row="artist-add"><a className={styles.add} href="#directory-explore" onClick={(event) => { event.preventDefault(); focusDirectorySearch(); }} aria-label={c.findGroups}><FanIcon icon={Plus} size={24} /></a><span className={styles.slotName} aria-hidden="true" /></li>
      {waiting ? Array.from({ length: SLOTS + 1 }, (_, i) => <li key={i} className={styles.slot} data-row="artist-loading" aria-hidden="true"><FanSkeleton shape="circle" width={64} height={64} /><FanSkeleton width={48} height={12} /></li>)
        : ghost ? Array.from({ length: SLOTS }, (_, i) => <li key={i} className={styles.slot} data-row="artist-ghost" aria-hidden="true"><span className={styles.ghost} /><span className={styles.ghostName} /></li>)
        : items.map((page) => <li key={page.id} className={styles.slot} data-row="artist">
          <Link className={styles.artist} href={groupHref(page, locale) as Route}>
            {page.slug ? <CreatorAvatar slug={page.slug} src={page.imageUrl} size={64} photos={undefined} /> : <span className={styles.ghost} />}
            <span className={styles.slotName}>{page.name}</span>
          </Link>
        </li>)}
    </ul>
  </section>;
}

/** The page's picture, or a white ring with its first letter: the board never draws the grey fallback figure. */
function PostAvatar({ post }: { post: PopularPost }) {
  return post.pageImageUrl
    ? <CreatorAvatar slug={post.pageRef} src={post.pageImageUrl} size={32} photos={undefined} />
    : <span className={styles.initial} aria-hidden="true">{[...post.pageName][0]}</span>;
}

const postHref = (post: PopularPost, locale: AppLocale) => post.source === "fan" ? `/c/${post.pageRef}/community/${post.id}?locale=${locale}` : `/pages/groups/${post.pageRef}?locale=${locale}&tab=board&post=${post.id}`;
const pageHref = (post: PopularPost, locale: AppLocale) => post.source === "fan" ? `/${post.pageRef}?locale=${locale}` : `/pages/groups/${post.pageRef}?locale=${locale}`;
const firstLine = (title: string) => title.split("\n").map((line) => line.trim()).find(Boolean) ?? title;

/** 다섯 줄 고정(0건이면 첫 줄이 "아직 Hot 게시글 없음"). 펼치면 받아 둔 열 줄까지, 새 요청은 없다. */
export function HotPosts({ locale }: { locale: AppLocale }) {
  const c = directoryTopCopy(locale);
  const [open, setOpen] = useState(false);
  const [sort, setSort] = useState<"likes" | "comments" | "views">("likes");
  const url = `/api/public/popular-posts?locale=${toContentLocale(locale)}&page=1&sort=${sort}`;
  const auth = useByUsAuth(), signedIn = auth.ready && auth.authenticated;
  const hinted = useSyncExternalStore(noSubscribe, mayHaveSession, () => false);
  const publicAllowed = auth.ready ? !auth.authenticated : !hinted;
  const anonymous = useCommunityResource(publicAllowed ? url : null, parsePosts, false, true, true), viewer = useCommunityResource(signedIn ? url : null, parsePosts, false, true);
  const { state, retry } = signedIn ? viewer : anonymous;
  const ready = state.status === "ready";
  const total = ready ? state.data.items.length : 0;
  const items = ready ? state.data.items.slice(0, open ? 10 : ROWS) : [];
  return <section className={styles.hot} aria-labelledby="directory-hot-posts" data-directory-block="hot-posts">
    <div className={styles.hotHead}><FanHeading id="directory-hot-posts">{c.hotTitle}</FanHeading>
      <FanMenu label={c.hotTitle} trigger={<FanIconButton className={styles.hotSort} aria-label={c.hotSort[sort]}>{c.hotSort[sort]}<FanIcon icon={ChevronDown} size={16} /></FanIconButton>}>
        <FanMenu.Radio value={sort} onValueChange={value => { if (value === "likes" || value === "comments" || value === "views") { setSort(value); setOpen(false); } }} items={(["likes", "comments", "views"] as const).map(value => ({ value, label: c.hotSort[value] }))} />
      </FanMenu></div>
    {state.status === "error" ? <div className={styles.state}><FanState inline compact kind="error" title={c.hotError} actions={<FanAction variant="text" size="sm" onClick={retry}>{c.retry}</FanAction>} /></div>
      : <ul className={styles.posts}>{!ready ? Array.from({ length: ROWS }, (_, i) => <li key={i} className={styles.post} data-row="hot-loading" aria-hidden="true"><FanSkeleton shape="circle" width={32} height={32} /><FanSkeleton width="70%" height={16} /><FanSkeleton width="40%" height={12} /></li>)
        : <>{items.map((post) => <li key={`${post.source}:${post.id}`} className={styles.postItem} data-row="hot-post">
          <FanPostRow locale={locale} href={postHref(post, locale)} title={firstLine(post.title)} pageImage={<PostAvatar post={post} />} commentCount={post.commentCount}
            source={{ label: post.pageName, href: pageHref(post, locale) }} author={post.nickname} time={post.createdAt} views={post.viewCount} likes={post.likeCount} />
        </li>)}{Array.from({ length: Math.max(0, (open ? 2 * ROWS : ROWS) - items.length) }, (_, i) => {
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
  const drag = useHorizontalDrag<HTMLAnchorElement>("banner", (step) => setIndex((value) => (value + step + banners.length) % banners.length));
  if (!banners.length) return null;
  const banner = banners[index % banners.length]!;
  const mobile = banner.mobileImage ?? banner.desktopImage;
  const href = localizedBannerHref(banner.href, locale);
  const fill = isStrip(banner);
  const move = (step: number) => setIndex((value) => (value + step + banners.length) % banners.length);
  return <section className={styles.thin} data-fill={fill || undefined} aria-roledescription="carousel" aria-label={c.bannerLabel} data-directory-block="thin-banner">
    {fill
      ? <a className={styles.thinFull} href={href} aria-label={banner.title} {...drag}>
        <picture><source media="(min-width: 64rem)" srcSet={banner.desktopImage.url} width={banner.desktopImage.width} height={banner.desktopImage.height} /><img src={mobile.url} width={mobile.width} height={mobile.height} alt="" /></picture>
      </a>
      : <a className={styles.thinSlide} href={href} {...drag}>
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
