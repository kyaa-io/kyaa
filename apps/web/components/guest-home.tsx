"use client";

import type { Route } from "next";
import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";
import { Suspense, use, useMemo, type ReactNode } from "react";

import type { AppLocale } from "@/i18n/locales";
import { toContentLocale } from "@/i18n/locales";
import { levelLabel, type PassportLevel } from "@/features/passport/domain/passport-read-model";
import { HomeRankingCard, feedDate } from "@/features/rankings/ui/home-ranking-card";
import { HomeChallenges } from "@/features/rankings/ui/home-challenges";
import { useSelectedBias } from "@/features/selected-bias/ui/use-selected-bias";
import { useGroupResource } from "@/features/groups/ui/use-group-resource";
import { feedPageSchema, type FeedItem } from "@/features/fan-posts/domain/feed";
import { noticeMedia } from "@/features/media/domain/official-media";
import { groupDetailSchema } from "@/features/groups/domain/contracts";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import type { HomeBanner } from "@/features/home/domain/home-banner";
import { localizedBannerHref } from "@/features/home/domain/home-banner";
import type { LiveEventResponse } from "@/features/live/domain/live-event";
import type { PublishedCelebrity } from "@/server/content/content-domain";
import { CreatorAvatar } from "./fan-ui/creator-avatar";
import { FanAction } from "./fan-ui/fan-action";
import { FanHeading } from "./fan-ui/fan-heading";
import { FanIcon } from "./fan-ui/fan-icon";
import { FanSkeleton } from "./fan-ui/fan-skeleton";
import { formatCountMetric } from "./fan-ui/fan-count";
import { FanAppFrame, FanContentContainer } from "./fan-shell/fan-app-shell";
import { fanLoginHref } from "./login-href";
import type { HomeQueries } from "./home-query-stream";
import styles from "./guest-home.module.css";

/** Home words (ko·en; the other languages read the English until the catalog carries them). */
const words = (locale: AppLocale) => locale === "ko" ? {
  title: "홈", myNews: "내 최애 소식", more: "더 보기", official: "공식 소식", liveNow: "LIVE 중", liveAt: (at: string) => `LIVE ${at}`,
  noNews: "새 소식이 없습니다", choose: "최애 고르기", yourFavorite: "당신의 최애", fanPage: "팬페이지 보기", loginChoose: "로그인하고 최애 고르기",
  fans: (n: string) => `팬 ${n}`,
} : {
  title: "Home", myNews: "My favorite's news", more: "More", official: "Official", liveNow: "LIVE now", liveAt: (at: string) => `LIVE ${at}`,
  noNews: "No new posts", choose: "Choose a favorite", yourFavorite: "Your favorite", fanPage: "View fan page", loginChoose: "Sign in to choose a favorite",
  fans: (n: string) => `${n} fans`,
};

export function formatKoreanLiveDate(value: string) {
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) throw new Error("Invalid LIVE timestamp");
  const kst = new Date(instant.getTime() + 9 * 60 * 60 * 1000);
  const hour = kst.getUTCHours();
  const period = hour < 12 ? "오전" : "오후";
  const displayHour = hour % 12 || 12;
  return `${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일 ${period} ${displayHour}:${String(kst.getUTCMinutes()).padStart(2, "0")}`;
}

export function formatPassportTier(tier: PassportLevel, locale: AppLocale) {
  return levelLabel(locale, tier);
}

const parseFeed = (value: unknown) => feedPageSchema.parse(value);
const parseGroup = (value: unknown) => groupDetailSchema.parse(value);
type Notice = Extract<FeedItem, { kind: "notice" }>;

/** The favorite's official posts, newest first: artist posts, then notices (8장 plan ⑥). */
function useFavoriteNews(locale: AppLocale, slug: string | null) {
  const feed = useGroupResource(slug ? `/api/celebrities/${encodeURIComponent(slug)}/feed?locale=${toContentLocale(locale)}&source=official&limit=10` : null, parseFeed);
  const notices = useMemo(() => (feed.data?.items ?? []).filter((item): item is Notice => item.kind === "notice"), [feed.data]);
  const ordered = useMemo(() => [...notices.filter((item) => item.postType === "artist_post"), ...notices.filter((item) => item.postType !== "artist_post")], [notices]);
  return { notices, ordered, loading: feed.loading, error: feed.error };
}

type HeroModel = { kind: "live" | "official" | "banner"; title: string; href: string; image: string | null; alt: string; meta: ReactNode; external?: boolean };

/** The post's first public photo, or none (a body this screen cannot read draws the title alone). */
function noticeImage(notice: Notice, slug: string) {
  try { return noticeMedia({ ...notice, kind: notice.noticeKind } as Parameters<typeof noticeMedia>[0], slug).find((item) => item.kind === "photos" && item.image)?.image ?? null; }
  catch { return null; }
}

const isLive = (event: LiveEventResponse) => event.live.effectiveStatus === "live";
function nextLive(lives: readonly LiveEventResponse[], now = Date.now()) {
  return [...lives].filter((event) => event.live.effectiveStatus === "scheduled" && Date.parse(event.live.startsAt) > now).sort((a, b) => Date.parse(a.live.startsAt) - Date.parse(b.live.startsAt))[0] ?? null;
}

/** ① Hero (8장 plan ⑥): a LIVE in progress, else the favorite's newest official post, else the operator banner. A LIVE coming up is
 * one meta item, not a block (plan ⑦). One image 16:9, title 26/800 (the home's first look), meta 12. */
function pickHero(locale: AppLocale, lives: readonly LiveEventResponse[], notices: readonly Notice[], favoriteSlug: string | null, banners: readonly HomeBanner[]): HeroModel | null {
  const t = words(locale);
  const live = lives.find(isLive);
  if (live) return { kind: "live", title: live.live.title, href: `/live/${live.live.slug}?locale=${locale}`, image: live.live.heroImage.url, alt: live.live.heroImage.alt,
    meta: <><span className={styles.liveDot} aria-hidden="true" /><span>{t.liveNow}</span><span aria-hidden="true"> · </span><span>{live.live.celebrity.name}</span></> };
  const notice = notices[0];
  if (notice && favoriteSlug) {
    const image = noticeImage(notice, favoriteSlug);
    const date = feedDate(notice.publishedAt);
    return { kind: "official", title: notice.title, href: `/c/${encodeURIComponent(favoriteSlug)}/notices/${encodeURIComponent(notice.slug)}?locale=${locale}`, image, alt: "",
      meta: <><span>{t.official}</span>{date ? <><span aria-hidden="true"> · </span><time dateTime={notice.publishedAt}>{date}</time></> : null}</> };
  }
  const banner = banners[0];
  if (banner) return { kind: "banner", title: banner.title, href: localizedBannerHref(banner.href, locale), image: (banner.desktopImage ?? banner.mobileImage)?.url ?? null, alt: banner.alt,
    meta: banner.description ? <span>{banner.description}</span> : null, external: !banner.href.startsWith("/") };
  return null;
}

function HomeHero({ locale, hero, upcoming, loading }: { locale: AppLocale; hero: HeroModel | null; upcoming: LiveEventResponse | null; loading: boolean }) {
  const t = words(locale);
  if (loading || !hero) return <section className={styles.hero} data-block="hero" aria-busy={loading || undefined}>
    <div className={styles.heroMedia} data-skeleton="" aria-hidden="true"><FanSkeleton shape="block" width="100%" height="100%" /></div>
    <div className={styles.heroBody}><FanSkeleton width="70%" height={26} /><FanSkeleton width="40%" height={12} /></div>
  </section>;
  const next = upcoming && hero.kind !== "live" ? feedDate(upcoming.live.startsAt) : null;
  return <section className={styles.hero} data-block="hero" data-hero-kind={hero.kind} aria-labelledby="home-hero-title">
    <Link className={styles.heroLink} href={hero.href as Route} {...(hero.external ? { target: "_blank", rel: "noreferrer" } : {})}>
      <span className={styles.heroMedia}>{hero.image ? <img src={hero.image} alt={hero.alt} loading="eager" fetchPriority="high" decoding="async" /> : null}</span>
      <span className={styles.heroBody}>
        <FanHeading as="h1" id="home-hero-title">{hero.title}</FanHeading>
        {hero.meta || next ? <span className={styles.heroMeta} data-meta="">{hero.meta}{hero.meta && next ? <span aria-hidden="true"> · </span> : null}{next ? <span data-live-next="">{t.liveAt(next)}</span> : null}</span> : null}
      </span>
    </Link>
  </section>;
}

/** ② 내 최애 소식 (plan ⑥): two or three 72px rows — avatar 32 · name · date / one line. Signed out: no block. No favorite: one 48px row to choose. */
function MyNews({ locale, favorite, news, deciding = false }: { locale: AppLocale; favorite: { slug: string; name: string; image: string; imagePosition?: string } | null; news: ReturnType<typeof useFavoriteNews>; deciding?: boolean }) {
  const t = words(locale);
  if (deciding) news = { ...news, loading: true };
  const head = <div className={styles.sectionHead}><FanHeading id="home-news-heading">{t.myNews}</FanHeading>
    {favorite ? <Link className={styles.more} href={`/${encodeURIComponent(favorite.slug)}?tab=notice&locale=${locale}` as Route}>{t.more}<FanIcon icon={ChevronRight} size={16} /></Link> : null}</div>;
  if (!favorite && !deciding) return <section className={styles.news} data-block="feed" aria-labelledby="home-news-heading">{head}
    <Link className={styles.chooseRow} data-row="menu" href={`/pages/groups?locale=${locale}` as Route}><FanIcon icon={Plus} size={20} /><span>{t.choose}</span><FanIcon icon={ChevronRight} size={16} /></Link>
  </section>;
  const rows = favorite ? news.ordered.slice(0, 3) : [];
  return <section className={styles.news} data-block="feed" aria-labelledby="home-news-heading" aria-busy={news.loading || undefined}>{head}
    {news.loading ? <ul className={styles.newsRows}>{[0, 1].map((i) => <li key={i} className={styles.newsRow} data-skeleton="" aria-hidden="true"><FanSkeleton shape="circle" width={32} height={32} /><span className={styles.newsText}><FanSkeleton width="30%" height={14} /><FanSkeleton width="80%" height={14} /></span></li>)}</ul>
      : rows.length === 0 ? <p className={styles.empty} data-fan-state="empty">{t.noNews}</p>
      : <ul className={styles.newsRows}>{rows.map((item) => {
        const date = feedDate(item.publishedAt);
        if (!favorite) return null;
        return <li key={item.id}><Link className={styles.newsRow} data-row="notice" href={`/c/${encodeURIComponent(favorite.slug)}/notices/${encodeURIComponent(item.slug)}?locale=${locale}` as Route}>
          <CreatorAvatar slug={favorite.slug} src={favorite.image} position={favorite.imagePosition} size={32} photos={undefined} />
          <span className={styles.newsText}>
            <span className={styles.newsHead} data-meta=""><strong>{favorite.name}</strong>{date ? <time dateTime={item.publishedAt}>{date}</time> : null}</span>
            <span className={styles.newsLine}>{item.title}</span>
          </span>
        </Link></li>;
      })}</ul>}
  </section>;
}

/** Aside 당신의 최애 (plan ②): avatar 48 · name · 팬 N, and the home's one primary `팬페이지 보기`. No favorite: `최애 고르기`; signed out:
 * `로그인하고 최애 고르기` — the card stays, so a guest sees what the place is for. */
function FavoriteCard({ locale, favorite, guest }: { locale: AppLocale; favorite: { slug: string; name: string; image: string; imagePosition?: string } | null; guest: boolean }) {
  const t = words(locale);
  const group = useGroupResource(favorite ? `/api/groups/resolve/${encodeURIComponent(favorite.slug)}` : null, parseGroup);
  const members = group.data?.page.memberCount;
  const action = favorite ? { href: `/${encodeURIComponent(favorite.slug)}?locale=${locale}`, label: t.fanPage }
    : guest ? { href: fanLoginHref(locale, `/?locale=${locale}`), label: t.loginChoose }
    : { href: `/pages/groups?locale=${locale}`, label: t.choose };
  return <section className={styles.favorite} data-block="aside-card" aria-labelledby="home-favorite-heading">
    <FanHeading id="home-favorite-heading">{t.yourFavorite}</FanHeading>
    {favorite ? <div className={styles.favoriteIdentity}>
      <CreatorAvatar slug={favorite.slug} src={favorite.image} position={favorite.imagePosition} size={48} photos={undefined} />
      <span className={styles.favoriteText}><strong>{favorite.name}</strong>
        <span className={styles.favoriteMeta} data-meta="">{members === undefined ? <span className={styles.metaHold} aria-hidden="true" /> : <span data-metric="count" data-fact="">{t.fans(formatCountMetric(locale, members))}</span>}</span>
      </span>
    </div> : null}
    <FanAction variant="primary" fullWidth href={action.href}>{action.label}</FanAction>
  </section>;
}

type HomeData = { lives: readonly LiveEventResponse[]; banners: readonly HomeBanner[]; ready: boolean };

/** 5차 홈(B4, 4-F): ① 히어로 ② 내 최애 소식 ③ 랭킹 ④ 찐팬 100 챌린지 + 보조 `당신의 최애`. 1440 = 본문 733 + 보조 343 in a 1,100 container,
 * 390 = one column hero → 당신의 최애 → 소식 → 랭킹 → 챌린지. 팬게시판·이벤트 배너·다가오는 LIVE·크리에이터 줄은 없다(8장 plan ⑦). */
function HomeBody({ locale, data }: { locale: AppLocale; data: HomeData }) {
  const auth = useByUsAuth();
  const bias = useSelectedBias(locale);
  const guest = auth.ready && !auth.authenticated;
  const favorite = bias.selected ? { slug: bias.selected.slug, name: bias.selected.name, image: bias.selected.image, imagePosition: bias.selected.imagePosition } : null;
  const news = useFavoriteNews(locale, favorite?.slug ?? null);
  const deciding = !data.ready || bias.status === "loading" || (favorite !== null && news.loading);
  const hero = deciding ? null : pickHero(locale, data.lives, news.ordered.length ? news.notices : [], favorite?.slug ?? null, data.banners);
  const mine = favorite ? [favorite.slug] : [];
  return <div className={styles.layout} data-layout="two-col">
    <div className={styles.primary}>
      <div className={styles.slotHero}><HomeHero locale={locale} hero={hero} upcoming={nextLive(data.lives)} loading={deciding} /></div>
      {guest ? null : <div className={styles.slotNews}><MyNews locale={locale} favorite={favorite} news={news} deciding={!auth.ready || bias.status === "loading"} /></div>}
      <div className={styles.slotRanking}><HomeRankingCard locale={locale} /></div>
      <div className={styles.slotChallenge}><HomeChallenges locale={locale} preferredSlugs={mine} /></div>
    </div>
    <aside className={styles.aside} aria-labelledby="home-favorite-heading">
      <div className={styles.slotFavorite}><FavoriteCard locale={locale} favorite={favorite} guest={guest} /></div>
    </aside>
  </div>;
}

function HomeLayout({ locale, children }: { locale: AppLocale; children: ReactNode }) {
  return <FanAppFrame locale={locale} mainId="main-content">
    <div className={styles.page} data-fan-pulse-home="">
      <FanContentContainer as="main" id="main-content" tabIndex={-1} className={styles.main}>{children}</FanContentContainer>
    </div>
  </FanAppFrame>;
}

type GuestHomeProps = { homeBanners?: readonly HomeBanner[]; celebrities?: readonly PublishedCelebrity[]; featuredLives: readonly LiveEventResponse[]; locale: AppLocale };

export function GuestHome({ locale, homeBanners = [], featuredLives }: GuestHomeProps) {
  return <HomeLayout locale={locale}><HomeBody locale={locale} data={{ lives: featuredLives, banners: homeBanners, ready: true }} /></HomeLayout>;
}

type StreamingHomeProps = { locale: AppLocale; queries: HomeQueries; publishedCreatorSlugs?: Promise<readonly string[] | null>; initialOwnedOnly?: boolean; initialRole?: unknown };

function StreamedBody({ locale, queries }: { locale: AppLocale; queries: HomeQueries }) {
  const lives = use(queries.featuredLives), banners = use(queries.homeBanners);
  return <HomeBody locale={locale} data={{ lives: lives.status === "fulfilled" ? lives.value : [], banners: banners.status === "fulfilled" ? banners.value : [], ready: true }} />;
}

export function StreamingGuestHome({ queries, locale }: StreamingHomeProps) {
  return <HomeLayout locale={locale}>
    <Suspense fallback={<HomeBody locale={locale} data={{ lives: [], banners: [], ready: false }} />}><StreamedBody locale={locale} queries={queries} /></Suspense>
  </HomeLayout>;
}
