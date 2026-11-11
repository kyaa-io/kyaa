"use client";
import signupStyles from "@/features/home/ui/signup-event-banner.module.css";

import type { RaffleList } from "@/features/benefit/domain/raffle";
import type { AppLocale } from "@/i18n/locales";
import type { BannerSlotMap, HomeBanner } from "../features/home/domain/home-banner";
import type { HomeQueries } from "./home-query-stream";
import type { PublishedCelebrity, PublishedCelebrityLive } from "../server/content/content-domain";

import { messages as localizedMessages } from "@/i18n/catalogs/components__guest-home";
import { additionalLocales } from "@/i18n/messages";




import { type CreatorRoleFilter } from "@/features/creator/domain/creator-role";

import { Suspense, use, type ReactNode } from "react";
import { gggiHomeBanner } from "../features/home/domain/gggi-home-banner";
import { missionbookHomeBanner } from "../features/home/domain/missionbook-home-banner";
import { useRouter } from "next/navigation";
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
import { HomeJjinfanStrip } from "@/features/rankings/ui/home-jjinfan-strip";
import { ThinBanner } from "@/features/home/ui/home-thin-banner";
import { HomeGallery, HomeGalleryPlaceholder, HomeNotices, HomeNoticesPlaceholder } from "@/features/home/ui/home-placeholder-blocks";
import { ObservedLiveStrip } from "@/features/live/ui/observed-live-strip";
import { diversifyGalleryPhotos } from "@/features/home/domain/home-gallery-order";
import styles from "./guest-home.module.css";
import { ElinaGuideCard } from "./home-entry-cards/home-entry-cards";

const socialLabel = { youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram", chzzk: "치지직" } as const;

export type HomeContentErrors = { homeBanners?: boolean };
const allEvents = { ko: "전체 이벤트", en: "All events", ...localizedMessages.allEvents };

const copy = {
  ko: { skip: "본문으로 바로가기", language: "언어 선택, 현재 한국어", liveHeading: "Kyaa.", liveSub: "Every Fan Moment Counts.", noneStatus: "공개된 LIVE 없음", noneTitle: "새로운 LIVE를 준비하고 있어요.", reserve: "라이브 예약하기", details: "LIVE 상세보기", context: "로그인 및 팬 패스포트 시작", favorites: "당신의 최애", all: "전체 보기", celebrityList: "셀럽 목록", social: "공식 채널", liveNow: "LIVE 진행중", liveUpcoming: "LIVE 예정", noCelebrities: "현재 공개된 셀럽이 없습니다.", myFavoritesGuest: "내 최애를 보려면 로그인해 주세요.", myFavoritesLoading: "보유한 팬 패스포트를 확인하고 있어요.", myFavoritesError: "보유한 팬 패스포트를 확인하지 못했어요.", myFavoritesEmpty: "아직 보유한 팬 패스포트가 없어요.", myFavoritesUnavailable: "지금 공개된 내 최애가 없어요.", myFavoritesUnavailableHelp: "전체에서 다른 최애를 만나보세요.", myFavoritesHelp: "전체 최애를 둘러보고 팬 패스포트를 만들어 보세요.", signIn: "로그인하기", guestPanel: "로그인 전 팬 활동", soon: "곧 만날 최애", loginHint: "로그인하고 예약한 LIVE를 확인해 보세요.", signedInPanel: "나의 팬 활동", welcome: "반가워요.", myPassport: "내 패스포트", allPassports: "패스포트 전체 보기", reservedLive: "예약한 LIVE", liveDetails: "LIVE 상세 보기", noPassport: "아직 발급된 패스포트가 없어요.", passportPreview: "발급 전 팬 패스포트 미리보기", passportPreviewHint: "팬 인증 완료 후 발급돼요.", findFavorite: "팬 인증할 최애 찾기", noReservation: "예약한 LIVE가 없어요.", browseLive: "LIVE 둘러보기", retryTitle: "팬 활동을 불러오지 못했어요.", retryHelp: "잠시 후 다시 시도해 주세요.", retry: "다시 시도", loading: "팬 활동을 불러오는 중이에요.", stamps: "스탬프", recentNine: "최근 9개 표시" },
  en: { skip: "Skip to main content", language: "Choose language, currently English", liveHeading: "Kyaa.", liveSub: "Every Fan Moment Counts.", noneStatus: "No LIVE events available", noneTitle: "We’re preparing a new LIVE.", reserve: "Reserve a spot", details: "View LIVE details", context: "Sign in and start a Fan Passport", favorites: "Your favorites", all: "View all", celebrityList: "Celebrity list", social: "Official channel", liveNow: "LIVE NOW", liveUpcoming: "UPCOMING LIVE", noCelebrities: "No profiles are available right now.", myFavoritesGuest: "Sign in to see your favorites.", myFavoritesLoading: "Checking your Fan Passports.", myFavoritesError: "We couldn't check your Fan Passports.", myFavoritesEmpty: "You don't have a Fan Passport yet.", myFavoritesUnavailable: "None of your favorites are available right now.", myFavoritesUnavailableHelp: "Browse all celebrities to find another favorite.", myFavoritesHelp: "Browse all celebrities and create a Fan Passport.", signIn: "Sign in", guestPanel: "Fan activity preview", soon: "Your next LIVE", loginHint: "Sign in to see the LIVE events you reserved.", signedInPanel: "My fan activity", welcome: "Welcome back.", myPassport: "My Fan Passport", allPassports: "View all Passports", reservedLive: "Reserved LIVE", liveDetails: "View LIVE details", noPassport: "You don't have a Passport yet.", passportPreview: "Fan Passport preview", passportPreviewHint: "Issued after fan verification.", findFavorite: "Find a celebrity to verify", noReservation: "You don't have any reserved LIVE events.", browseLive: "Browse LIVE events", retryTitle: "We couldn't load your fan activity.", retryHelp: "Please try again in a moment.", retry: "Try again", loading: "Loading your fan activity.", stamps: "Stamps", recentNine: "Showing the latest 9" },

  ...additionalLocales((translationLocale) => ({ skip: localizedMessages.m1f2d07933f72[translationLocale], language: localizedMessages.m2b9cc6c160b5[translationLocale], liveHeading: "Kyaa.", liveSub: "Every Fan Moment Counts.", noneStatus: localizedMessages.mccde2af4a88b[translationLocale], noneTitle: localizedMessages.md8d8997a6c05[translationLocale], reserve: localizedMessages.m828c4b76dc47[translationLocale], details: localizedMessages.m357122ff8ba1[translationLocale], context: localizedMessages.mb486d46ca0ac[translationLocale], favorites: localizedMessages.m66d82efbdffe[translationLocale], all: localizedMessages.mb77becf4fc95[translationLocale], celebrityList: localizedMessages.m0cf3ec288523[translationLocale], social: localizedMessages.me22245be7785[translationLocale], liveNow: localizedMessages.m3e2b2258026f[translationLocale], liveUpcoming: localizedMessages.m2385a41c8a58[translationLocale], noCelebrities: localizedMessages.m479576e01e3c[translationLocale], myFavoritesGuest: localizedMessages.m4b15ddf79f44[translationLocale], myFavoritesLoading: localizedMessages.me5538b70d1cf[translationLocale], myFavoritesError: localizedMessages.m6a62efb9c6f4[translationLocale], myFavoritesEmpty: localizedMessages.m2f6d85cfec82[translationLocale], myFavoritesUnavailable: localizedMessages.m59d84902398d[translationLocale], myFavoritesUnavailableHelp: localizedMessages.m97666ea9a11d[translationLocale], myFavoritesHelp: localizedMessages.m9a6d2845fc3e[translationLocale], signIn: localizedMessages.m07e0a9e48bd0[translationLocale], guestPanel: localizedMessages.mda49bf52819f[translationLocale], soon: localizedMessages.mc4ee815b442a[translationLocale], loginHint: localizedMessages.m6bb68c22ac32[translationLocale], signedInPanel: localizedMessages.mab415ccf7109[translationLocale], welcome: localizedMessages.m0b42e19ddd4d[translationLocale], myPassport: localizedMessages.m487a655fb68b[translationLocale], allPassports: localizedMessages.m543cb3ace5a0[translationLocale], reservedLive: localizedMessages.mdaf6cfd14de9[translationLocale], liveDetails: localizedMessages.m2536a94af120[translationLocale], noPassport: localizedMessages.mf590bcb19fb6[translationLocale], passportPreview: localizedMessages.m0fee008df904[translationLocale], passportPreviewHint: localizedMessages.mf031d3cda80f[translationLocale], findFavorite: localizedMessages.m135d3e0c6806[translationLocale], noReservation: localizedMessages.m9cd4b16f64f8[translationLocale], browseLive: localizedMessages.m6f3142fd97ae[translationLocale], retryTitle: localizedMessages.m0af50b904df8[translationLocale], retryHelp: localizedMessages.md769f12cf36e[translationLocale], retry: localizedMessages.m0261983ec47a[translationLocale], loading: localizedMessages.md2b2e951eb03[translationLocale], stamps: localizedMessages.m6c7f6a661030[translationLocale], recentNine: localizedMessages.m39ef6e8eec22[translationLocale] }))
} as const;

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

type GuestHomeProps = { elinaRaffles?: RaffleList["raffles"]; homeBanners?: readonly HomeBanner[]; homeSlots?: BannerSlotMap; celebrities: readonly PublishedCelebrity[]; locale: AppLocale; contentErrors?: HomeContentErrors };

export function GuestHome(props: GuestHomeProps) {
  return <HomeLayout locale={props.locale} hero={<HomeHero {...props} />} thinBanner={<HomeThinBanner banner={props.homeSlots?.home_below_board} locale={props.locale} />} notices={<HomeNoticesPlaceholder locale={props.locale} />} gallery={<HomeGalleryPlaceholder locale={props.locale} />} />;
}

/** 7차 홈(plan-ux-r8): 브랜드 줄·메인 배너 → 찐팬 100 줄(진행 중일 때만) → 랭킹 → 얇은 배너 → 공지·갤러리. 한 열이고 옆 패널이 없다(다가오는 LIVE 블록은 2026-11-09 사용자 결정으로 뺐다). */
function HomeLayout({ locale, hero, thinBanner, notices, gallery }: { locale: AppLocale; hero: ReactNode; thinBanner: ReactNode; notices: ReactNode; gallery: ReactNode }) {
  return (
    <FanAppFrame
      locale={locale}
      mainId="main-content"
    >
    <div className={styles.page} data-fan-pulse-home data-candidate="03">
      <div className={styles.shell}>
        <main id="main-content" className={styles.main}>
          {hero}
          <div className={styles.jjinfanStrip}><HomeJjinfanStrip locale={locale} /></div>
          <div id="home-ranking" className={styles.contentSection}><HomeRankingCard locale={locale} /></div>
          {thinBanner}
          <ObservedLiveStrip locale={locale} />
          {notices}
          {gallery}
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
type StreamingHomeProps = Pick<GuestHomeProps, "locale"> & { queries: HomeQueries };

export function StreamingGuestHome({ queries, ...props }: StreamingHomeProps) {
  const fallbackProps = { ...props, celebrities: [] };
  return <HomeLayout locale={props.locale}
    hero={<Suspense fallback={<HomeHero {...fallbackProps} homeBanners={[gggiHomeBanner(props.locale), missionbookHomeBanner(props.locale)]} elinaGuide={null} />}><StreamHomeHero {...props} queries={queries} /></Suspense>}
    thinBanner={<Suspense fallback={null}><StreamHomeThinBanner {...props} queries={queries} /></Suspense>}
    notices={<Suspense fallback={<HomeNoticesPlaceholder locale={props.locale} />}><StreamHomeNotices {...props} queries={queries} /></Suspense>}
    gallery={<Suspense fallback={<HomeGalleryPlaceholder locale={props.locale} />}><StreamHomeGallery {...props} queries={queries} /></Suspense>} />;
}

/** The strip is read on the server with the page, so it arrives in the page and never pushes the LIVE list down afterwards. */
function HomeThinBanner({ banner, locale }: { banner: HomeBanner | undefined; locale: AppLocale }) {
  if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_KYAA_SIGNUP_EVENT_LOCAL === "1") {
    return <FanAction href="/signup-event" variant="neutral" fullWidth className={signupStyles.banner}>11월 11일부터 2주간, 신규 가입 이벤트</FanAction>;
  }
  return banner ? <ThinBanner banner={banner} locale={locale} /> : null;
}
function StreamHomeThinBanner({ queries, locale }: Pick<StreamingHomeProps, "queries" | "locale">) {
  const result = use(queries.homeSlots);
  return <HomeThinBanner banner={result.status === "fulfilled" ? result.value.home_below_board : undefined} locale={locale} />;
}

/** 정상 0건만 "아직 공지 없음", 실패는 글 없는 자리표시 5행(20:52 결정): 블록 높이가 같다. */
function StreamHomeNotices({ queries, locale }: Pick<StreamingHomeProps, "queries" | "locale">) {
  const result = use(queries.homeNotices);
  return <HomeNotices locale={locale} notices={result.status === "fulfilled" ? result.value.items : "error"} />;
}

/** 정상 0건만 빈 상태 글을 보이고, 실패는 같은 자리표시를 글 없이 둔다(로딩도 같다). */
function StreamHomeGallery({ queries, locale }: Pick<StreamingHomeProps, "queries" | "locale">) {
  const photos = use(queries.homeGallery);
  // Resolve dimensions only inside the gallery boundary. Until then its outer
  // fallback uses the existing fixed reservation; Shorts cannot block the shell.
  return <Suspense fallback={<HomeGalleryPlaceholder locale={locale} expectedPhotos={photos.status === "fulfilled" ? photos.value.items : undefined} state={photos.status === "fulfilled" ? "loading" : "error"} />}>
    <StreamHomeGalleryContent queries={queries} locale={locale} photos={photos} />
  </Suspense>;
}

const HOME_GALLERY_PHOTOS = 12;
function StreamHomeGalleryContent({ queries, locale, photos }: Pick<StreamingHomeProps, "queries" | "locale"> & { photos: Awaited<HomeQueries["homeGallery"]> }) {
  const shorts = use(queries.homeShorts);
  // The read brings up to 24; the block shows the 12 most varied (one per post, creators in turn).
  const varied = photos.status === "fulfilled" ? diversifyGalleryPhotos(photos.value.items) : [];
  return <HomeGallery locale={locale} photos={photos.status === "fulfilled" ? varied.slice(0, HOME_GALLERY_PHOTOS) : "error"} hasMore={photos.status === "fulfilled" && (photos.value.nextCursor !== null || varied.length > HOME_GALLERY_PHOTOS)}
    shorts={shorts.status === "fulfilled" ? shorts.value : "error"} />;
}

function StreamHomeHero({ queries, ...props }: Pick<StreamingHomeProps, "queries" | "locale">) {
  const result = use(queries.homeBanners);
  return <HomeHero {...props} celebrities={[]}
    homeBanners={[gggiHomeBanner(props.locale), missionbookHomeBanner(props.locale), ...(result.status === "fulfilled" ? result.value : [])]}
    contentErrors={{ homeBanners: result.status === "rejected" }}
    elinaGuide={<Suspense fallback={<PersonalizationLoading quiet locale={props.locale} />}><StreamElinaGuide queries={queries} locale={props.locale} hero /></Suspense>} />;
}

function StreamElinaGuide({ queries, locale, hero = false }: Pick<StreamingHomeProps, "queries" | "locale"> & { hero?: boolean }) {
  const raffles = use(queries.elinaRaffles);
  const celebrities = use(queries.celebrities);
  if (raffles.status === "rejected") return <ContentLoadError locale={locale} />;
  return <ElinaGuideCard locale={locale} hero={hero} elina={celebrities.status === "fulfilled" ? celebrities.value.find(item => item.slug === "elina") : undefined} raffles={raffles.value.raffles} />;
}
