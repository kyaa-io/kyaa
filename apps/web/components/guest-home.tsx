"use client";

import type { RaffleList } from "@/features/benefit/domain/raffle";
import type { AppLocale } from "@/i18n/locales";
import type { BannerSlotMap, HomeBanner } from "../features/home/domain/home-banner";
import type { Route } from "next";
import type { HomeQueries } from "./home-query-stream";
import type { LiveEventResponse } from "../features/live/domain/live-event";
import type { PublishedCelebrity, PublishedCelebrityLive } from "../server/content/content-domain";

import { messages as localizedMessages } from "@/i18n/catalogs/components__guest-home";
import { additionalLocales, translate } from "@/i18n/messages";
import { nearestRecurringLives } from "@/features/live/domain/nearest-recurring-lives";


import { CreatorAvatar } from "@/components/fan-ui/creator-avatar";

import { LiveTimeIndicator } from "@/features/live/ui/live-time-indicator";

import { type CreatorRoleFilter } from "@/features/creator/domain/creator-role";

import Link from "next/link";
import { Suspense, use, useCallback, useEffect, useState, type ReactNode } from "react";
import { gggiHomeBanner } from "../features/home/domain/gggi-home-banner";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "./icons";
import { FanAppFrame } from "./fan-shell/fan-app-shell";
import { LiveHeroCarousel } from "./live-hero-carousel";
import {
  ActivePreviewCoordinator,
  ActivePreviewVideo,
} from "./active-preview-video";
import { levelLabel, type PassportLevel } from "../features/passport/domain/passport-read-model";
import { FanSectionHeader } from "./fan-ui/fan-heading";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanSkeleton, FanSkeletonStatus } from "@/components/fan-ui/fan-skeleton";
import { HomeRankingCard } from "@/features/rankings/ui/home-ranking-card";
import { ThinBanner } from "@/features/home/ui/home-thin-banner";
import { HomeGalleryPlaceholder, HomeNotices, HomeNoticesPlaceholder } from "@/features/home/ui/home-placeholder-blocks";
import { ObservedLiveStrip } from "@/features/live/ui/observed-live-strip";
import styles from "./guest-home.module.css";
import { ElinaGuideCard } from "./home-entry-cards/home-entry-cards";

const socialLabel = { youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram", chzzk: "치지직" } as const;
const UPCOMING_LIVE_PAGE_SIZE = 3;

export type HomeContentErrors = { homeBanners?: boolean; featuredLives?: boolean };
const allEvents = { ko: "전체 이벤트", en: "All events", ...localizedMessages.allEvents };

const copy = {
  ko: { skip: "본문으로 바로가기", language: "언어 선택, 현재 한국어", liveHeading: "Kyaa.", liveSub: "Every Fan Moment Counts.", allLive: "전체 라이브", noneStatus: "공개된 LIVE 없음", noneTitle: "새로운 LIVE를 준비하고 있어요.", reserve: "라이브 예약하기", details: "LIVE 상세보기", context: "로그인 및 팬 패스포트 시작", favorites: "당신의 최애", all: "전체 보기", celebrityList: "셀럽 목록", detail: "상세 보기", social: "공식 채널", liveNow: "LIVE 진행중", liveUpcoming: "LIVE 예정", noCelebrities: "현재 공개된 셀럽이 없습니다.", myFavoritesGuest: "내 최애를 보려면 로그인해 주세요.", myFavoritesLoading: "보유한 팬 패스포트를 확인하고 있어요.", myFavoritesError: "보유한 팬 패스포트를 확인하지 못했어요.", myFavoritesEmpty: "아직 보유한 팬 패스포트가 없어요.", myFavoritesUnavailable: "지금 공개된 내 최애가 없어요.", myFavoritesUnavailableHelp: "전체에서 다른 최애를 만나보세요.", myFavoritesHelp: "전체 최애를 둘러보고 팬 패스포트를 만들어 보세요.", signIn: "로그인하기", upcoming: "다가오는 LIVE", previousLivePage: "이전 LIVE 목록", nextLivePage: "다음 LIVE 목록", noLive: "현재 공개된 LIVE가 없습니다.", guestPanel: "로그인 전 팬 활동", soon: "곧 만날 최애", loginHint: "로그인하고 예약한 LIVE를 확인해 보세요.", signedInPanel: "나의 팬 활동", welcome: "반가워요.", myPassport: "내 패스포트", allPassports: "패스포트 전체 보기", reservedLive: "예약한 LIVE", liveDetails: "LIVE 상세 보기", noPassport: "아직 발급된 패스포트가 없어요.", passportPreview: "발급 전 팬 패스포트 미리보기", passportPreviewHint: "팬 인증 완료 후 발급돼요.", findFavorite: "팬 인증할 최애 찾기", noReservation: "예약한 LIVE가 없어요.", browseLive: "LIVE 둘러보기", retryTitle: "팬 활동을 불러오지 못했어요.", retryHelp: "잠시 후 다시 시도해 주세요.", retry: "다시 시도", loading: "팬 활동을 불러오는 중이에요.", stamps: "스탬프", recentNine: "최근 9개 표시" },
  en: { skip: "Skip to main content", language: "Choose language, currently English", liveHeading: "Kyaa.", liveSub: "Every Fan Moment Counts.", allLive: "All LIVE events", noneStatus: "No LIVE events available", noneTitle: "We’re preparing a new LIVE.", reserve: "Reserve a spot", details: "View LIVE details", context: "Sign in and start a Fan Passport", favorites: "Your favorites", all: "View all", celebrityList: "Celebrity list", detail: "View details", social: "Official channel", liveNow: "LIVE NOW", liveUpcoming: "UPCOMING LIVE", noCelebrities: "No profiles are available right now.", myFavoritesGuest: "Sign in to see your favorites.", myFavoritesLoading: "Checking your Fan Passports.", myFavoritesError: "We couldn't check your Fan Passports.", myFavoritesEmpty: "You don't have a Fan Passport yet.", myFavoritesUnavailable: "None of your favorites are available right now.", myFavoritesUnavailableHelp: "Browse all celebrities to find another favorite.", myFavoritesHelp: "Browse all celebrities and create a Fan Passport.", signIn: "Sign in", upcoming: "Upcoming LIVE", previousLivePage: "Previous LIVE events", nextLivePage: "Next LIVE events", noLive: "No LIVE events are available right now.", guestPanel: "Fan activity preview", soon: "Your next LIVE", loginHint: "Sign in to see the LIVE events you reserved.", signedInPanel: "My fan activity", welcome: "Welcome back.", myPassport: "My Fan Passport", allPassports: "View all Passports", reservedLive: "Reserved LIVE", liveDetails: "View LIVE details", noPassport: "You don't have a Passport yet.", passportPreview: "Fan Passport preview", passportPreviewHint: "Issued after fan verification.", findFavorite: "Find a celebrity to verify", noReservation: "You don't have any reserved LIVE events.", browseLive: "Browse LIVE events", retryTitle: "We couldn't load your fan activity.", retryHelp: "Please try again in a moment.", retry: "Try again", loading: "Loading your fan activity.", stamps: "Stamps", recentNine: "Showing the latest 9" },

  ...additionalLocales((translationLocale) => ({ skip: localizedMessages.m1f2d07933f72[translationLocale], language: localizedMessages.m2b9cc6c160b5[translationLocale], liveHeading: "Kyaa.", liveSub: "Every Fan Moment Counts.", allLive: localizedMessages.m54dd85c7923f[translationLocale], noneStatus: localizedMessages.mccde2af4a88b[translationLocale], noneTitle: localizedMessages.md8d8997a6c05[translationLocale], reserve: localizedMessages.m828c4b76dc47[translationLocale], details: localizedMessages.m357122ff8ba1[translationLocale], context: localizedMessages.mb486d46ca0ac[translationLocale], favorites: localizedMessages.m66d82efbdffe[translationLocale], all: localizedMessages.mb77becf4fc95[translationLocale], celebrityList: localizedMessages.m0cf3ec288523[translationLocale], detail: localizedMessages.m60da1bd22057[translationLocale], social: localizedMessages.me22245be7785[translationLocale], liveNow: localizedMessages.m3e2b2258026f[translationLocale], liveUpcoming: localizedMessages.m2385a41c8a58[translationLocale], noCelebrities: localizedMessages.m479576e01e3c[translationLocale], myFavoritesGuest: localizedMessages.m4b15ddf79f44[translationLocale], myFavoritesLoading: localizedMessages.me5538b70d1cf[translationLocale], myFavoritesError: localizedMessages.m6a62efb9c6f4[translationLocale], myFavoritesEmpty: localizedMessages.m2f6d85cfec82[translationLocale], myFavoritesUnavailable: localizedMessages.m59d84902398d[translationLocale], myFavoritesUnavailableHelp: localizedMessages.m97666ea9a11d[translationLocale], myFavoritesHelp: localizedMessages.m9a6d2845fc3e[translationLocale], signIn: localizedMessages.m07e0a9e48bd0[translationLocale], upcoming: localizedMessages.m51dfa5dd0f6f[translationLocale], previousLivePage: localizedMessages.mdf97b80344c5[translationLocale], nextLivePage: localizedMessages.m2eb9d49d3f74[translationLocale], noLive: localizedMessages.m35ff321a05aa[translationLocale], guestPanel: localizedMessages.mda49bf52819f[translationLocale], soon: localizedMessages.mc4ee815b442a[translationLocale], loginHint: localizedMessages.m6bb68c22ac32[translationLocale], signedInPanel: localizedMessages.mab415ccf7109[translationLocale], welcome: localizedMessages.m0b42e19ddd4d[translationLocale], myPassport: localizedMessages.m487a655fb68b[translationLocale], allPassports: localizedMessages.m543cb3ace5a0[translationLocale], reservedLive: localizedMessages.mdaf6cfd14de9[translationLocale], liveDetails: localizedMessages.m2536a94af120[translationLocale], noPassport: localizedMessages.mf590bcb19fb6[translationLocale], passportPreview: localizedMessages.m0fee008df904[translationLocale], passportPreviewHint: localizedMessages.mf031d3cda80f[translationLocale], findFavorite: localizedMessages.m135d3e0c6806[translationLocale], noReservation: localizedMessages.m9cd4b16f64f8[translationLocale], browseLive: localizedMessages.m6f3142fd97ae[translationLocale], retryTitle: localizedMessages.m0af50b904df8[translationLocale], retryHelp: localizedMessages.md769f12cf36e[translationLocale], retry: localizedMessages.m0261983ec47a[translationLocale], loading: localizedMessages.md2b2e951eb03[translationLocale], stamps: localizedMessages.m6c7f6a661030[translationLocale], recentNine: localizedMessages.m39ef6e8eec22[translationLocale] }))
} as const;

export function formatKoreanLiveDate(value: string) {
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) throw new Error("Invalid LIVE timestamp");
  const kst = new Date(instant.getTime() + 9 * 60 * 60 * 1000);
  const hour = kst.getUTCHours();
  const period = hour < 12 ? "오전" : "오후";
  const displayHour = hour % 12 || 12;
  return `${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일 ${period} ${displayHour}:${String(kst.getUTCMinutes()).padStart(2, "0")}`;
}

function formatLiveDate(value: string, locale: AppLocale) {
  if (locale === "ko") return formatKoreanLiveDate(value);
  return new Intl.DateTimeFormat(locale, { calendar: "gregory", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Seoul" }).format(new Date(value));
}

export function formatPassportTier(tier: PassportLevel, locale: AppLocale) {
  return levelLabel(locale, tier);
}

function PersonalizationLoading({ locale, quiet = false }: { locale: AppLocale; quiet?: boolean }) {
  return (
    <section className={`${styles.personalizationState} ${styles.personalizationLoading}`} aria-busy="true">
      {quiet ? null : <FanSkeletonStatus locale={locale} label={copy[locale].loading} />}
      <FanSkeleton shape="block" width="100%" height="100%" />
      <FanSkeleton shape="block" width="100%" height="100%" />
    </section>
  );
}

function ContentLoadError({ locale }: { locale: AppLocale }) {
  const router = useRouter();
  return <div className={styles.personalizationState} role="alert"><strong>{copy[locale].retryTitle}</strong><span>{copy[locale].retryHelp}</span><FanAction onClick={() => router.refresh()}>{copy[locale].retry}</FanAction></div>;
}

type GuestHomeProps = { elinaRaffles?: RaffleList["raffles"]; homeBanners?: readonly HomeBanner[]; homeSlots?: BannerSlotMap; celebrities: readonly PublishedCelebrity[]; featuredLives: readonly LiveEventResponse[]; featuredLivesQuery?: HomeQueries["featuredLives"]; locale: AppLocale; contentErrors?: HomeContentErrors };

export function GuestHome(props: GuestHomeProps) {
  return <HomeLayout locale={props.locale} hero={<HomeHero {...props} />} thinBanner={<HomeThinBanner banner={props.homeSlots?.home_below_board} locale={props.locale} />} notices={<HomeNoticesPlaceholder locale={props.locale} />} upcoming={<HomeUpcoming {...props} />} />;
}

/** 7차 홈(plan-ux-r8): 브랜드 줄·메인 배너 → 랭킹 → 얇은 배너 → 다가오는 LIVE. 한 열이고 옆 패널이 없다. */
function HomeLayout({ locale, hero, thinBanner, notices, upcoming }: { locale: AppLocale; hero: ReactNode; thinBanner: ReactNode; notices: ReactNode; upcoming: ReactNode }) {
  return (
    <FanAppFrame
      locale={locale}
      mainId="main-content"
    >
    <div className={styles.page} data-fan-pulse-home data-candidate="03">
      <div className={styles.shell}>
        <main id="main-content" className={styles.main}>
          {hero}
          <div className={styles.contentSection}><HomeRankingCard locale={locale} /></div>
          {thinBanner}
          <ObservedLiveStrip locale={locale} />
          {notices}
          <HomeGalleryPlaceholder locale={locale} />
          {upcoming}
        </main>
      </div>
    </div>
    </FanAppFrame>
  );
}

function HomeHero({ locale, homeBanners = [], celebrities, elinaRaffles, contentErrors = {}, elinaGuide }: GuestHomeProps & { elinaGuide?: ReactNode }) {
  const t = copy[locale];
  const localeQuery = `?locale=${locale}`;
  return (<>          <section className={styles.heroSection} aria-labelledby="live-heading">
            <FanSectionHeader variant="editorial" as="h1" id="live-heading" title={<span className={styles.brandTitle}>{t.liveHeading}{" "}<span className={styles.brandSlogan}>{t.liveSub}</span></span>} action={{ href: `/events${localeQuery}`, label: allEvents[locale] }} />
            {contentErrors.homeBanners ? <ContentLoadError locale={locale} /> : null}
            <LiveHeroCarousel elinaRaffles={elinaRaffles} elina={celebrities.find(celebrity => celebrity.slug === "elina")} homeBanners={homeBanners} locale={locale} elinaGuide={elinaGuide} />
          </section>

</>);
}
function HomeUpcoming({ featuredLives, locale, contentErrors = {} }: GuestHomeProps) {
  const t = copy[locale];
  const localeQuery = `?locale=${locale}`;
  const router = useRouter();
  const refreshLiveStatus = useCallback(() => router.refresh(), [router]);
  const [upcomingPage, setUpcomingPage] = useState(0);
  const upcomingLives = nearestRecurringLives(featuredLives);
  const upcomingPageCount = Math.max(1, Math.ceil(upcomingLives.length / UPCOMING_LIVE_PAGE_SIZE));
  const visibleFeaturedLives = upcomingLives.slice(
    upcomingPage * UPCOMING_LIVE_PAGE_SIZE,
    (upcomingPage + 1) * UPCOMING_LIVE_PAGE_SIZE,
  );
  useEffect(() => {
    setUpcomingPage((currentPage) => Math.min(currentPage, upcomingPageCount - 1));
  }, [upcomingPageCount]);

  return (<>          <section id="upcoming" className={styles.contentSection} aria-labelledby="upcoming-heading">
            <FanSectionHeader variant="editorial" id="upcoming-heading" title={t.upcoming} action={{ href: `/live${localeQuery}`, label: t.allLive }} />
            {contentErrors.featuredLives ? <ContentLoadError locale={locale} /> : <div className={styles.liveList} data-paginated={upcomingPageCount > 1 ? "true" : undefined}>
              {featuredLives.length > 0 ? visibleFeaturedLives.map((featuredLive) => {
                return (
                  <article className={styles.liveRow} key={featuredLive.live.id}>
                    <CreatorAvatar slug={featuredLive.live.celebrity.slug} src={featuredLive.live.celebrity.image} photos={featuredLive.live.celebrity.photos} position={featuredLive.live.celebrity.imagePosition} size={{ mobile: 56, desktop: 64 }} />
                    <div className={styles.liveDetails}><span>{featuredLive.live.celebrity.name}</span><h3>{featuredLive.live.title}</h3><p>{formatLiveDate(featuredLive.live.startsAt, locale)}</p></div>
                    <div className={styles.liveMeta}><LiveTimeIndicator event={featuredLive.live} locale={locale} onStartReached={refreshLiveStatus} /></div>
                    <Link className={styles.rowAction} href={`/live/${featuredLive.live.slug}${localeQuery}` as Route} aria-label={locale === "ko" ? `${featuredLive.live.title} ${t.detail}` : translate(locale, localizedMessages.mbbae831d75b7, "View {0} details", [featuredLive.live.title])}><ChevronRight /></Link>
                  </article>
                );
              }) : <p>{t.noLive}</p>}
            </div>}
            {!contentErrors.featuredLives && upcomingPageCount > 1 ? (
              <nav className={styles.livePagination} aria-label={t.upcoming}>
                <button type="button" aria-label={t.previousLivePage} disabled={upcomingPage === 0} onClick={() => setUpcomingPage((page) => Math.max(0, page - 1))}><ChevronLeft /></button>
                <span aria-live="polite" aria-atomic="true">{upcomingPage + 1} / {upcomingPageCount}</span>
                <button type="button" aria-label={t.nextLivePage} disabled={upcomingPage === upcomingPageCount - 1} onClick={() => setUpcomingPage((page) => Math.min(upcomingPageCount - 1, page + 1))}><ChevronRight /></button>
              </nav>
            ) : null}
          </section>
</>);
}
type StreamingHomeProps = Pick<GuestHomeProps, "locale"> & { queries: HomeQueries };

export function StreamingGuestHome({ queries, ...props }: StreamingHomeProps) {
  const fallbackProps = { ...props, celebrities: [], featuredLives: [] };
  return <HomeLayout locale={props.locale}
    hero={<Suspense fallback={<HomeHero {...fallbackProps} homeBanners={[gggiHomeBanner(props.locale)]} elinaGuide={null} />}><StreamHomeHero {...props} queries={queries} /></Suspense>}
    thinBanner={<Suspense fallback={null}><StreamHomeThinBanner {...props} queries={queries} /></Suspense>}
    notices={<Suspense fallback={<HomeNoticesPlaceholder locale={props.locale} />}><StreamHomeNotices {...props} queries={queries} /></Suspense>}
    upcoming={<Suspense fallback={<PersonalizationLoading quiet locale={props.locale} />}><StreamHomeUpcoming {...props} queries={queries} /></Suspense>} />;
}

/** The strip is read on the server with the page, so it arrives in the page and never pushes the LIVE list down afterwards. */
function HomeThinBanner({ banner, locale }: { banner: HomeBanner | undefined; locale: AppLocale }) {
  return banner ? <ThinBanner banner={banner} locale={locale} /> : null;
}
function StreamHomeThinBanner({ queries, locale }: Pick<StreamingHomeProps, "queries" | "locale">) {
  const result = use(queries.homeSlots);
  return <HomeThinBanner banner={result.status === "fulfilled" ? result.value.home_below_board : undefined} locale={locale} />;
}

/** 0건·오류면 자리표시 5행 그대로(D-3 기본안): 블록 높이가 같다. */
function StreamHomeNotices({ queries, locale }: Pick<StreamingHomeProps, "queries" | "locale">) {
  const result = use(queries.homeNotices);
  return <HomeNotices locale={locale} notices={result.status === "fulfilled" ? result.value.items : null} />;
}

function StreamHomeHero({ queries, ...props }: Pick<StreamingHomeProps, "queries" | "locale">) {
  const result = use(queries.homeBanners);
  return <HomeHero {...props} celebrities={[]} featuredLives={[]}
    homeBanners={[gggiHomeBanner(props.locale), ...(result.status === "fulfilled" ? result.value : [])]}
    contentErrors={{ homeBanners: result.status === "rejected" }}
    elinaGuide={<Suspense fallback={<PersonalizationLoading quiet locale={props.locale} />}><StreamElinaGuide queries={queries} locale={props.locale} hero /></Suspense>} />;
}

function StreamHomeUpcoming({ queries, ...props }: Pick<StreamingHomeProps, "queries" | "locale">) {
  const result = use(queries.featuredLives);
  return <HomeUpcoming {...props} celebrities={[]} featuredLives={result.status === "fulfilled" ? result.value : []} contentErrors={{ featuredLives: result.status === "rejected" }} />;
}

function StreamElinaGuide({ queries, locale, hero = false }: Pick<StreamingHomeProps, "queries" | "locale"> & { hero?: boolean }) {
  const raffles = use(queries.elinaRaffles);
  const celebrities = use(queries.celebrities);
  if (raffles.status === "rejected") return <ContentLoadError locale={locale} />;
  return <ElinaGuideCard locale={locale} hero={hero} elina={celebrities.status === "fulfilled" ? celebrities.value.find(item => item.slug === "elina") : undefined} raffles={raffles.value.raffles} />;
}
