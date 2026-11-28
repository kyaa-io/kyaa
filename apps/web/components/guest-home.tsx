"use client";

import type { RaffleList } from "@/features/benefit/domain/raffle";
import type { AppLocale } from "@/i18n/locales";
import type { BannerSlotMap, HomeBanner } from "../features/home/domain/home-banner";
import { AdsenseUnit } from "../features/adsense/ui/adsense-unit";
import type { HomeQueries } from "./home-query-stream";
import type { PublishedCelebrity, PublishedCelebrityLive } from "../server/content/content-domain";

import { messages as localizedMessages } from "@/i18n/catalogs/components__guest-home";
import { additionalLocales } from "@/i18n/messages";




import { type CreatorRoleFilter } from "@/features/creator/domain/creator-role";

import { Suspense, use, type ReactNode } from "react";
import { adminEventBanners, isLiveCampaignBanner } from "../features/home/domain/event-banner-priority";
import { FIRST_STEPS_BANNER_ID } from "../features/home/domain/first-steps-home-banner";
import { HomeEventStrip } from "../features/home/ui/home-event-strip";
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
import { HomeRankingCard } from "@/features/rankings/ui/home-ranking-card";
import { HomeHeartDonation } from "@/features/rankings/ui/home-heart-donation";
import { HomeBelowRankingSlot } from "@/components/banner-slot/home-below-ranking-slot";
import type { HeartDonationEvent } from "@/features/rankings/domain/heart-donation";
import type { HomeTopBanner } from "@/server/config/heart-donation-event";
import { ThinBanner } from "@/features/home/ui/home-thin-banner";
import { HomeGallery, HomeGalleryPlaceholder, HomeNotices, HomeNoticesPlaceholder } from "@/features/home/ui/home-placeholder-blocks";
import { ObservedLiveStrip } from "@/features/live/ui/observed-live-strip";
import { homeGalleryPostPhotos } from "@/features/home/domain/home-gallery-order";
import styles from "./guest-home.module.css";

const socialLabel = { youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram", chzzk: "치지직" } as const;

export type HomeContentErrors = { homeBanners?: boolean };
const allEvents = { ko: "전체 이벤트", en: "All events", mn: "All events", ...localizedMessages.allEvents, ja: "全イベント" };

const copy = {
  ko: { skip: "본문으로 바로가기", language: "언어 선택, 현재 한국어", liveHeading: "Kyaa.", liveSub: "Every Fan Moment Counts.", noneStatus: "공개된 LIVE 없음", noneTitle: "새로운 LIVE를 준비하고 있어요.", reserve: "라이브 예약하기", details: "LIVE 상세보기", context: "로그인 및 팬 패스포트 시작", favorites: "당신의 최애", all: "전체 보기", celebrityList: "셀럽 목록", social: "공식 채널", liveNow: "LIVE 진행중", liveUpcoming: "LIVE 예정", noCelebrities: "현재 공개된 셀럽이 없습니다.", myFavoritesGuest: "내 최애를 보려면 로그인해 주세요.", myFavoritesLoading: "보유한 팬 패스포트를 확인하고 있어요.", myFavoritesError: "보유한 팬 패스포트를 확인하지 못했어요.", myFavoritesEmpty: "아직 보유한 팬 패스포트가 없어요.", myFavoritesUnavailable: "지금 공개된 내 최애가 없어요.", myFavoritesUnavailableHelp: "전체에서 다른 최애를 만나보세요.", myFavoritesHelp: "전체 최애를 둘러보고 팬 패스포트를 만들어 보세요.", signIn: "로그인하기", guestPanel: "로그인 전 팬 활동", soon: "곧 만날 최애", loginHint: "로그인하고 예약한 LIVE를 확인해 보세요.", signedInPanel: "나의 팬 활동", welcome: "반가워요.", myPassport: "내 패스포트", allPassports: "패스포트 전체 보기", reservedLive: "예약한 LIVE", liveDetails: "LIVE 상세 보기", noPassport: "아직 발급된 패스포트가 없어요.", passportPreview: "발급 전 팬 패스포트 미리보기", passportPreviewHint: "팬 인증 완료 후 발급돼요.", findFavorite: "팬 인증할 최애 찾기", noReservation: "예약한 LIVE가 없어요.", browseLive: "LIVE 둘러보기", retryTitle: "팬 활동을 불러오지 못했어요.", retryHelp: "잠시 후 다시 시도해 주세요.", retry: "다시 시도", loading: "팬 활동을 불러오는 중이에요.", stamps: "스탬프", recentNine: "최근 9개 표시" },
  mn: { skip: "Skip to main content", language: "Choose language, currently English", liveHeading: "Kyaa.", liveSub: "Every Fan Moment Counts.", noneStatus: "No LIVE events available", noneTitle: "We’re preparing a new LIVE.", reserve: "Reserve a spot", details: "View LIVE details", context: "Sign in and start a Fan Passport", favorites: "Your favorites", all: "View all", celebrityList: "Celebrity list", social: "Official channel", liveNow: "LIVE NOW", liveUpcoming: "UPCOMING LIVE", noCelebrities: "No profiles are available right now.", myFavoritesGuest: "Sign in to see your favorites.", myFavoritesLoading: "Checking your Fan Passports.", myFavoritesError: "We couldn't check your Fan Passports.", myFavoritesEmpty: "You don't have a Fan Passport yet.", myFavoritesUnavailable: "None of your favorites are available right now.", myFavoritesUnavailableHelp: "Browse all celebrities to find another favorite.", myFavoritesHelp: "Browse all celebrities and create a Fan Passport.", signIn: "Sign in", guestPanel: "Fan activity preview", soon: "Your next LIVE", loginHint: "Sign in to see the LIVE events you reserved.", signedInPanel: "My fan activity", welcome: "Welcome back.", myPassport: "My Fan Passport", allPassports: "View all Passports", reservedLive: "Reserved LIVE", liveDetails: "View LIVE details", noPassport: "You don't have a Passport yet.", passportPreview: "Fan Passport preview", passportPreviewHint: "Issued after fan verification.", findFavorite: "Find a celebrity to verify", noReservation: "You don't have any reserved LIVE events.", browseLive: "Browse LIVE events", retryTitle: "We couldn't load your fan activity.", retryHelp: "Please try again in a moment.", retry: "Try again", loading: "Loading your fan activity.", stamps: "Stamps", recentNine: "Showing the latest 9" },
  en: { skip: "Skip to main content", language: "Choose language, currently English", liveHeading: "Kyaa.", liveSub: "Every Fan Moment Counts.", noneStatus: "No LIVE events available", noneTitle: "We’re preparing a new LIVE.", reserve: "Reserve a spot", details: "View LIVE details", context: "Sign in and start a Fan Passport", favorites: "Your favorites", all: "View all", celebrityList: "Celebrity list", social: "Official channel", liveNow: "LIVE NOW", liveUpcoming: "UPCOMING LIVE", noCelebrities: "No profiles are available right now.", myFavoritesGuest: "Sign in to see your favorites.", myFavoritesLoading: "Checking your Fan Passports.", myFavoritesError: "We couldn't check your Fan Passports.", myFavoritesEmpty: "You don't have a Fan Passport yet.", myFavoritesUnavailable: "None of your favorites are available right now.", myFavoritesUnavailableHelp: "Browse all celebrities to find another favorite.", myFavoritesHelp: "Browse all celebrities and create a Fan Passport.", signIn: "Sign in", guestPanel: "Fan activity preview", soon: "Your next LIVE", loginHint: "Sign in to see the LIVE events you reserved.", signedInPanel: "My fan activity", welcome: "Welcome back.", myPassport: "My Fan Passport", allPassports: "View all Passports", reservedLive: "Reserved LIVE", liveDetails: "View LIVE details", noPassport: "You don't have a Passport yet.", passportPreview: "Fan Passport preview", passportPreviewHint: "Issued after fan verification.", findFavorite: "Find a celebrity to verify", noReservation: "You don't have any reserved LIVE events.", browseLive: "Browse LIVE events", retryTitle: "We couldn't load your fan activity.", retryHelp: "Please try again in a moment.", retry: "Try again", loading: "Loading your fan activity.", stamps: "Stamps", recentNine: "Showing the latest 9" },

  ...additionalLocales((translationLocale) => ({ skip: localizedMessages.m1f2d07933f72[translationLocale], language: localizedMessages.m2b9cc6c160b5[translationLocale], liveHeading: "Kyaa.", liveSub: "Every Fan Moment Counts.", noneStatus: localizedMessages.mccde2af4a88b[translationLocale], noneTitle: localizedMessages.md8d8997a6c05[translationLocale], reserve: localizedMessages.m828c4b76dc47[translationLocale], details: localizedMessages.m357122ff8ba1[translationLocale], context: localizedMessages.mb486d46ca0ac[translationLocale], favorites: localizedMessages.m66d82efbdffe[translationLocale], all: localizedMessages.mb77becf4fc95[translationLocale], celebrityList: localizedMessages.m0cf3ec288523[translationLocale], social: localizedMessages.me22245be7785[translationLocale], liveNow: localizedMessages.m3e2b2258026f[translationLocale], liveUpcoming: localizedMessages.m2385a41c8a58[translationLocale], noCelebrities: localizedMessages.m479576e01e3c[translationLocale], myFavoritesGuest: localizedMessages.m4b15ddf79f44[translationLocale], myFavoritesLoading: localizedMessages.me5538b70d1cf[translationLocale], myFavoritesError: localizedMessages.m6a62efb9c6f4[translationLocale], myFavoritesEmpty: localizedMessages.m2f6d85cfec82[translationLocale], myFavoritesUnavailable: localizedMessages.m59d84902398d[translationLocale], myFavoritesUnavailableHelp: localizedMessages.m97666ea9a11d[translationLocale], myFavoritesHelp: localizedMessages.m9a6d2845fc3e[translationLocale], signIn: localizedMessages.m07e0a9e48bd0[translationLocale], guestPanel: localizedMessages.mda49bf52819f[translationLocale], soon: localizedMessages.mc4ee815b442a[translationLocale], loginHint: localizedMessages.m6bb68c22ac32[translationLocale], signedInPanel: localizedMessages.mab415ccf7109[translationLocale], welcome: localizedMessages.m0b42e19ddd4d[translationLocale], myPassport: localizedMessages.m487a655fb68b[translationLocale], allPassports: localizedMessages.m543cb3ace5a0[translationLocale], reservedLive: localizedMessages.mdaf6cfd14de9[translationLocale], liveDetails: localizedMessages.m2536a94af120[translationLocale], noPassport: localizedMessages.mf590bcb19fb6[translationLocale], passportPreview: localizedMessages.m0fee008df904[translationLocale], passportPreviewHint: localizedMessages.mf031d3cda80f[translationLocale], findFavorite: localizedMessages.m135d3e0c6806[translationLocale], noReservation: localizedMessages.m9cd4b16f64f8[translationLocale], browseLive: localizedMessages.m6f3142fd97ae[translationLocale], retryTitle: localizedMessages.m0af50b904df8[translationLocale], retryHelp: localizedMessages.md769f12cf36e[translationLocale], retry: localizedMessages.m0261983ec47a[translationLocale], loading: localizedMessages.md2b2e951eb03[translationLocale], stamps: localizedMessages.m6c7f6a661030[translationLocale], recentNine: localizedMessages.m39ef6e8eec22[translationLocale] }))
} as const;

export function formatPassportTier(tier: PassportLevel, locale: AppLocale) {
  return levelLabel(locale, tier);
}

function ContentLoadError({ locale }: { locale: AppLocale }) {
  const router = useRouter();
  return <div className={styles.personalizationState} role="alert"><strong>{copy[locale].retryTitle}</strong><span>{copy[locale].retryHelp}</span><FanAction onClick={() => router.refresh()}>{copy[locale].retry}</FanAction></div>;
}

type GuestHomeProps = { elinaRaffles?: RaffleList["raffles"]; homeBanners?: readonly HomeBanner[]; homeSlots?: BannerSlotMap; celebrities: readonly PublishedCelebrity[]; locale: AppLocale; contentErrors?: HomeContentErrors; /** 홈배너1(랭킹 바로 아래): 찐팬 하트 후원 줄 또는 찐팬 100 배너 줄(서버 플래그, 운영 기본 꺼짐). */ jjinfanGauge?: boolean; /** 후원 이벤트 설정(함께하는 크리에이터·후원처). */ heartDonation?: HeartDonationEvent; /** 홈배너1(랭킹 바로 아래) 내용: 후원 게이지 줄(기본) 또는 찐팬 100 배너 줄. */ homeTop?: HomeTopBanner };

export function GuestHome(props: GuestHomeProps) {
  return <HomeLayout locale={props.locale}><HomeContent locale={props.locale} jjinfanGauge={props.jjinfanGauge} heartDonation={props.heartDonation} homeTop={props.homeTop} hero={<HomeHero {...props} />} midBanner={<HomeMidBanner banner={props.homeSlots?.home_mid} locale={props.locale} />} thinBanner={<HomeThinBanner banner={props.homeSlots?.home_below_board} locale={props.locale} />} notices={<HomeNoticesPlaceholder locale={props.locale} />} gallery={<HomeGalleryPlaceholder locale={props.locale} />} /></HomeLayout>;
}

function HomeLayout({ locale, children }: { locale: AppLocale; children: ReactNode }) {
  return (
    <FanAppFrame locale={locale} mainId="main-content">
      <div className={styles.page} data-fan-pulse-home data-candidate="03">
        <div className={styles.shell}>
          <main id="main-content" className={styles.main}>{children}</main>
        </div>
      </div>
    </FanAppFrame>
  );
}

/** 7차 홈(plan-ux-r8, 2026-11-17 순서 변경): 브랜드 줄·메인 배너 → 홈배너2(외부 광고, 등록 전엔 없음) → 랭킹 → 홈배너1(찐팬 하트 후원 줄, 찐팬 100 시작 뒤엔 찐팬 100 배너 줄) → 얇은 배너 → 공지·갤러리. 한 열이고 옆 패널이 없다(다가오는 LIVE 블록은 2026-11-09 사용자 결정으로 뺐다). */
function HomeContent({ locale, jjinfanGauge = false, heartDonation, homeTop = "donation", eventStrip = null, hero, midBanner, thinBanner, notices, gallery }: { locale: AppLocale; jjinfanGauge?: boolean; heartDonation?: HeartDonationEvent; homeTop?: HomeTopBanner; /** 헤더 아래 이벤트 띠(관리자 '이벤트' 1번 배너). 없으면 자리도 두지 않는다. */ eventStrip?: ReactNode; hero: ReactNode; midBanner: ReactNode; thinBanner: ReactNode; notices: ReactNode; gallery: ReactNode }) {
  return (
    <>
      {eventStrip}
      {hero}
      {midBanner}
      <div id="home-ranking" className={styles.contentSection}><HomeRankingCard locale={locale} /></div>
      {jjinfanGauge ? <div className={styles.jjinfanStrip} data-banner-slot="home_top">{homeTop === "jjinfan100" ? <HomeBelowRankingSlot locale={locale} /> : <HomeHeartDonation locale={locale} event={heartDonation} />}</div> : null}
      {thinBanner}
      <ObservedLiveStrip locale={locale} />
      {notices}
      {gallery}
    </>
  );
}

function HomeHero({ locale, homeBanners = [], celebrities, elinaRaffles, contentErrors = {}, elinaGuide, liveEventBannerIds }: GuestHomeProps & { elinaGuide?: ReactNode; liveEventBannerIds?: string[] }) {
  const t = copy[locale];
  const localeQuery = `?locale=${locale}`;
  return (<>          <section className={styles.heroSection} aria-labelledby="live-heading">
            <FanSectionHeader variant="editorial" as="h1" id="live-heading" title={<span className={styles.brandTitle}>{t.liveHeading}{" "}<span className={styles.brandSlogan}>{t.liveSub}</span></span>} action={{ href: `/events${localeQuery}`, label: allEvents[locale] }} />
            {contentErrors.homeBanners ? <ContentLoadError locale={locale} /> : null}
            {/* 보여 줄 배너가 없으면(전부 비공개·조회 실패) 빈 캐러셀 틀을 그리지 않는다. */}
            {homeBanners.length === 0 && elinaGuide === null ? null : <LiveHeroCarousel elinaRaffles={elinaRaffles} elina={celebrities.find(celebrity => celebrity.slug === "elina")} homeBanners={homeBanners} liveEventBannerIds={liveEventBannerIds} locale={locale} elinaGuide={elinaGuide} />}
          </section>

</>);
}
type StreamingHomeProps = Pick<GuestHomeProps, "locale" | "jjinfanGauge" | "heartDonation" | "homeTop"> & { queries: HomeQueries; /** 이벤트 띠를 닫은 배너 id(쿠키). 같은 배너의 띠는 서버가 그리지 않는다. */ closedEventStrip?: string; /** 온보딩 첫 걸음 배너(M1). 세 걸음을 마친 브라우저는 서버가 false로 넘기고, 그 배너를 빼고 그린다. */ firstSteps?: boolean };

export function StreamingGuestHome({ queries, closedEventStrip, ...props }: StreamingHomeProps) {
  return <HomeLayout locale={props.locale}><Suspense fallback={<div className={styles.pendingContent} aria-hidden="true" />}><ResolvedGuestHome {...props} queries={queries} closedEventStrip={closedEventStrip} /></Suspense></HomeLayout>;
}

function ResolvedGuestHome({ queries, closedEventStrip, ...props }: StreamingHomeProps) {
  const result = use(queries.homeBanners);
  const managed = result.status === "fulfilled" ? result.value : [];
  const now = Date.now();
  const banner = adminEventBanners(managed, now)[0];
  // 홈 캐러셀은 관리자 배너 순서만 따른다(11/23 "코드가 아니라 어드민으로").
  const homeBanners = props.firstSteps ? managed : managed.filter(item => item.id !== FIRST_STEPS_BANNER_ID);
  return <HomeContent locale={props.locale} jjinfanGauge={props.jjinfanGauge} heartDonation={props.heartDonation} homeTop={props.homeTop}
    eventStrip={banner && banner.id !== closedEventStrip ? <HomeEventStrip key={banner.id} banner={banner} locale={props.locale} /> : null}
    hero={<HomeHero {...props} celebrities={[]} homeBanners={homeBanners}
      liveEventBannerIds={managed.filter(item => isLiveCampaignBanner(item, now)).map(item => item.id)}
      contentErrors={{ homeBanners: result.status === "rejected" }}
      elinaGuide={null} />}
    midBanner={<Suspense fallback={null}><StreamHomeMidBanner {...props} queries={queries} /></Suspense>}
    thinBanner={<Suspense fallback={null}><StreamHomeThinBanner {...props} queries={queries} /></Suspense>}
    notices={<Suspense fallback={<HomeNoticesPlaceholder locale={props.locale} />}><StreamHomeNotices {...props} queries={queries} /></Suspense>}
    gallery={<Suspense fallback={<HomeGalleryPlaceholder locale={props.locale} />}><StreamHomeGallery {...props} queries={queries} /></Suspense>} />;
}

/** The strip is read on the server with the page, so it arrives in the page and never pushes the LIVE list down afterwards. */
function HomeThinBanner({ banner, locale }: { banner: HomeBanner | undefined; locale: AppLocale }) {
  return banner ? <ThinBanner banner={banner} locale={locale} size={banner.category === "ad" ? "below-ranking-ad" : "thin"} /> : null;
}
/** 홈배너2(외부 광고 칸): 메인 배너 바로 아래, 랭킹 바로 위(위 16px). 등록·공개된 배너가 없거나 읽기에 실패하면 구역도 간격도 그리지 않는다. */
function HomeMidBanner({ banner, locale }: { banner: HomeBanner | undefined; locale: AppLocale }) {
  // Without a registered banner the space may carry an AdSense unit; with no unit ID it is not drawn either.
  return banner ? <div className={styles.midBanner}><ThinBanner banner={banner} locale={locale} size="mid" /></div> : <AdsenseUnit placement="home_mid" locale={locale} className={styles.midBanner} />;
}
function StreamHomeMidBanner({ queries, locale }: Pick<StreamingHomeProps, "queries" | "locale">) {
  const result = use(queries.homeSlots);
  return <HomeMidBanner banner={result.status === "fulfilled" ? result.value.home_mid : undefined} locale={locale} />;
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
  const result = use(queries.homeGallery);
  const posts = result.status === "fulfilled" ? homeGalleryPostPhotos(result.value.items) : [];
  const photos = result.status === "fulfilled" ? posts.slice(0, 24) : "error";
  const hasMore = result.status === "fulfilled";
  return <Suspense fallback={<HomeGalleryPlaceholder locale={locale} expectedPhotos={photos === "error" ? undefined : photos} state={photos === "error" ? "error" : "loading"} />}>
    <StreamHomeGalleryContent queries={queries} locale={locale} photos={photos} hasMore={hasMore} />
  </Suspense>;
}

function StreamHomeGalleryContent({ queries, locale, photos, hasMore }: Pick<StreamingHomeProps, "queries" | "locale"> & Pick<Parameters<typeof HomeGallery>[0], "photos" | "hasMore">) {
  const shorts = use(queries.homeShorts);
  return <HomeGallery locale={locale} photos={photos} hasMore={hasMore}
    shorts={shorts.status === "fulfilled" ? shorts.value : "error"} />;
}
