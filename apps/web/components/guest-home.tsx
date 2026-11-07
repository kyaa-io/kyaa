"use client";

import type { RaffleList } from "@/features/benefit/domain/raffle";
import type { AppLocale } from "@/i18n/locales";
import { messages as localizedMessages } from "@/i18n/catalogs/components__guest-home";
import { additionalLocales, translate } from "@/i18n/messages";
import { rankingsText } from "@/features/rankings/ui/rankings-copy";
import { nearestRecurringLives } from "@/features/live/domain/nearest-recurring-lives";
import type { HomeBanner } from "../features/home/domain/home-banner";

import { creatorHomeHref } from "@/features/creator/domain/creator-navigation";

import { CreatorFanLink } from "./fan-ui/creator-fan-link";
import { CreatorAvatar } from "@/components/fan-ui/creator-avatar";

import { LiveTimeIndicator } from "@/features/live/ui/live-time-indicator";

import { CreatorPortrait } from "./fan-ui/creator-portrait";
import { CreatorRoleFilterControl } from "./fan-ui/creator-roles";
import { availableCreatorRoles, matchesCreatorRole, type CreatorRoleFilter } from "@/features/creator/domain/creator-role";
import { HomeOwnerProvider, useHomeOwner } from "./fan-ui/home-owner-provider";

import Image from "next/image";
import { orderCreatorsForDiscovery } from "../server/content/creator-discovery";
import Link from "next/link";
import type { Route } from "next";
import { Suspense, use, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { HomeQueries } from "./home-query-stream";
import { gggiHomeBanner } from "../features/home/domain/gggi-home-banner";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "./icons";
import type { LiveEventResponse } from "../features/live/domain/live-event";
import type { PublishedCelebrity, PublishedCelebrityLive } from "../server/content/content-domain";
import { fanLoginHref } from "./login-href";
import { FanAppFrame } from "./fan-shell/fan-app-shell";
import { LiveHeroCarousel } from "./live-hero-carousel";
import {
  ActivePreviewCoordinator,
  ActivePreviewVideo,
} from "./active-preview-video";
import { formatLocalizedFanCount } from "./fan-ui/fan-count";
import { levelLabel, type PassportLevel } from "../features/passport/domain/passport-read-model";
import { FanSectionHeader } from "./fan-ui/fan-heading";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanSkeleton, FanSkeletonStatus } from "@/components/fan-ui/fan-skeleton";
import { HomeRankingCard } from "@/features/rankings/ui/home-ranking-card";
import styles from "./guest-home.module.css";
import { HomeEntryCards, ElinaGuideCard } from "./home-entry-cards/home-entry-cards";
import { HomeCommunityPreview } from "./home-community-preview";
import { ObservedLiveStrip } from "@/features/live/ui/observed-live-strip";
import { BannerSlot } from "./banner-slot/banner-slot";

const socialLabel = { youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram", chzzk: "치지직" } as const;
const UPCOMING_LIVE_PAGE_SIZE = 3;

export type HomeContentErrors = { homeBanners?: boolean; celebrities?: boolean; celebrityLives?: boolean; featuredLives?: boolean };
const allEvents = { ko: "전체 이벤트", en: "All events", ...localizedMessages.allEvents };

const copy = {
  ko: { skip: "본문으로 바로가기", language: "언어 선택, 현재 한국어", liveHeading: "Kyaa.", liveSub: "Every Fan Moment Counts.", allLive: "전체 라이브", noneStatus: "공개된 LIVE 없음", noneTitle: "새로운 LIVE를 준비하고 있어요.", reserve: "라이브 예약하기", details: "LIVE 상세보기", context: "로그인 및 Fan Passport 시작", favorites: "당신의 최애", all: "전체 보기", celebrityList: "셀럽 목록", detail: "상세 보기", social: "공식 채널", liveNow: "LIVE 진행중", liveUpcoming: "LIVE 예정", noCelebrities: "현재 공개된 셀럽이 없습니다.", myFavoritesGuest: "내 최애를 보려면 로그인해 주세요.", myFavoritesLoading: "보유한 Fan Passport를 확인하고 있어요.", myFavoritesError: "보유한 Fan Passport를 확인하지 못했어요.", myFavoritesEmpty: "아직 보유한 Fan Passport가 없어요.", myFavoritesUnavailable: "지금 공개된 내 최애가 없어요.", myFavoritesUnavailableHelp: "전체에서 다른 최애를 만나보세요.", myFavoritesHelp: "전체 최애를 둘러보고 Fan Passport를 만들어 보세요.", signIn: "로그인하기", upcoming: "다가오는 LIVE", previousLivePage: "이전 LIVE 목록", nextLivePage: "다음 LIVE 목록", noLive: "현재 공개된 LIVE가 없습니다.", guestPanel: "로그인 전 팬 활동", soon: "곧 만날 최애", loginHint: "로그인하고 예약한 LIVE를 확인해 보세요.", signedInPanel: "나의 팬 활동", welcome: "반가워요.", myPassport: "내 패스포트", allPassports: "패스포트 전체 보기", reservedLive: "예약한 LIVE", liveDetails: "LIVE 상세 보기", noPassport: "아직 발급된 Passport가 없어요.", passportPreview: "발급 전 Fan Passport 미리보기", passportPreviewHint: "팬 인증 완료 후 발급돼요.", findFavorite: "팬 인증할 최애 찾기", noReservation: "예약한 LIVE가 없어요.", browseLive: "LIVE 둘러보기", retryTitle: "팬 활동을 불러오지 못했어요.", retryHelp: "잠시 후 다시 시도해 주세요.", retry: "다시 시도", loading: "팬 활동을 불러오는 중이에요.", stamps: "Stamp", recentNine: "최근 9개 표시" },
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

type GuestHomeProps = { elinaRaffles?: RaffleList["raffles"]; homeBanners?: readonly HomeBanner[]; celebrities: readonly PublishedCelebrity[]; celebrityLives?: readonly PublishedCelebrityLive[]; featuredLives: readonly LiveEventResponse[]; featuredLivesQuery?: HomeQueries["featuredLives"]; locale: AppLocale; contentErrors?: HomeContentErrors; initialOwnedOnly?: boolean; initialRole?: CreatorRoleFilter };

export function GuestHome(props: GuestHomeProps) {
  return <HomeOwnerProvider locale={props.locale} publishedCreatorSlugs={props.celebrities.map(({ slug }) => slug)}><GuestHomeContent {...props} /></HomeOwnerProvider>;
}

function GuestHomeContent(props: GuestHomeProps) {
  return <HomeLayout locale={props.locale} celebrities={props.celebrities}
    hero={<HomeHero {...props} />} creators={<HomeCreators {...props} />}
    upcoming={<HomeUpcoming {...props} />} guides={<HomeEntryCards {...props} />}
    mobile={<HomePersonalization {...props} placement="mobile" />}
    desktop={<HomePersonalization {...props} placement="desktop" />} />;
}

function HomeLayout({ locale, celebrities = [], community, hero, creators, upcoming, guides, mobile, desktop }: { locale: AppLocale; celebrities?: readonly PublishedCelebrity[]; community?: ReactNode; hero: ReactNode; creators: ReactNode; upcoming: ReactNode; guides: ReactNode; mobile: ReactNode; desktop: ReactNode }) {
  const t = copy[locale];
  const owner = useHomeOwner();
  const communityPreview = community ?? <HomeCommunityPreview locale={locale} celebrities={celebrities} />;
  return (
    <FanAppFrame
      locale={locale}
      mainId="main-content"
    >
    <div className={styles.page} data-fan-pulse-home data-candidate="03">
      <div className={styles.shell}>
        <main id="main-content" className={styles.main}>
          {hero}

          {mobile}{communityPreview}<BannerSlot slot="home_below_board" locale={locale} className={styles.contentSection} /><ObservedLiveStrip locale={locale} />

          {creators}

          <div className={styles.mobileGuides}>
            {guides}
          </div>

          {upcoming}
        </main>

        <aside id="guest-context-panel" className={styles.contextPanel} aria-label={rankingsText(locale, "rkTitle")}>
          {desktop}
          {guides}
        </aside>
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
function HomeCreators({ celebrities, celebrityLives = [], locale, contentErrors = {}, initialOwnedOnly, initialRole = "all", previewQuery }: GuestHomeProps & { previewQuery?: HomeQueries["celebrityLives"] }) {
  const t = copy[locale];
  const router = useRouter();
  const localeQuery = `?locale=${locale}`;
  const owner = useHomeOwner();
  const personalization = { state: owner.personalization, retry: owner.retryPersonalization };
  const orderedCreators = orderCreatorsForDiscovery(celebrities);
  const [ownedOnlyOverride, setOwnedOnly] = useState(initialOwnedOnly);
  const [role, setRole] = useState<CreatorRoleFilter>(initialOwnedOnly ? "all" : initialRole);
  const ownedSlugs = personalization.state.status === "authenticated-ready"
    ? new Set(personalization.state.summary.creators.flatMap((creator) => creator.passport ? [creator.celebrity.slug] : []))
    : new Set<string>();
  const hasOwnedPassport = personalization.state.status === "authenticated-ready" && personalization.state.summary.collection.passportCount > 0;
  // Resolve the default before revealing the roster; explicit choices take precedence.
  const ownedOnly = ownedOnlyOverride ?? (role === "all" && hasOwnedPassport);
  const favoritesLoading = personalization.state.status === "auth-loading" || personalization.state.status === "authenticated-loading";
  const visibleCreators = orderedCreators.filter((creator) => matchesCreatorRole(creator.roles, role) && (!ownedOnly || (personalization.state.status === "authenticated-ready" && ownedSlugs.has(creator.slug))));
  const directoryQuery = new URLSearchParams({ locale });
  if (ownedOnly) directoryQuery.set("owned", "1");
  else if (role !== "all") directoryQuery.set("role", role);
  const directoryHref = `/celebrities?${directoryQuery}` as Route;
  const homeOwnedQuery = new URLSearchParams({ locale, owned: "1" });
  const ownedLoginHref = fanLoginHref(locale, `/?${homeOwnedQuery}`);

  const replaceHomeFilterUrl = (nextOwnedOnly: boolean, nextRole: CreatorRoleFilter) => {
    const url = new URL(window.location.href);
    if (nextOwnedOnly) url.searchParams.set("owned", "1");
    else url.searchParams.delete("owned");
    if (!nextOwnedOnly) url.searchParams.set("role", nextRole);
    else url.searchParams.delete("role");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  };
  const changeRole = (nextRole: CreatorRoleFilter) => {
    setOwnedOnly(false);
    setRole(nextRole);
    replaceHomeFilterUrl(false, nextRole);
  };
  const selectOwned = () => {
    if (personalization.state.status === "guest") {
      router.push(ownedLoginHref);
      return;
    }
    setOwnedOnly(true);
    setRole("all");
    replaceHomeFilterUrl(true, "all");
  };
  const creatorRailRef = useRef<HTMLDivElement>(null);
  const [creatorScroll, setCreatorScroll] = useState({ previous: false, next: false });
  const updateCreatorScroll = useCallback(() => {
    const rail = creatorRailRef.current;
    const first = rail?.querySelector<HTMLElement>("article");
    if (!rail || !first || rail.clientWidth === 0) {
      setCreatorScroll({ previous: false, next: false });
      return;
    }
    setCreatorScroll({ previous: rail.scrollLeft > 2, next: rail.scrollLeft + rail.clientWidth < rail.scrollWidth - 2 });
  }, []);
  useEffect(() => {
    const rail = creatorRailRef.current;
    if (!rail) return;
    updateCreatorScroll();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateCreatorScroll);
    observer?.observe(rail);
    window.addEventListener("resize", updateCreatorScroll);
    return () => { observer?.disconnect(); window.removeEventListener("resize", updateCreatorScroll); };
  }, [updateCreatorScroll, visibleCreators.length, ownedOnly, role, favoritesLoading]);
  const moveCreators = (direction: number) => {
    const rail = creatorRailRef.current;
    const card = rail?.querySelector<HTMLElement>("article");
    if (!rail || !card) return;
    const gap = Number.parseFloat(getComputedStyle(rail).columnGap) || 0;
    const stride = card.getBoundingClientRect().width + gap;
    const count = Math.max(1, Math.floor((rail.clientWidth + gap + 1) / stride));
    rail.scrollBy({ left: direction * stride * count, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };

  return (<>          <section id="celebrities" className={`${styles.contentSection} ${styles.favoriteSection}`} aria-labelledby="celebrities-heading">
            <FanSectionHeader variant="editorial" id="celebrities-heading" title={t.favorites} action={favoritesLoading ? undefined : { href: directoryHref, label: locale === "ko" ? "최애 전체 보기" : translate(locale, localizedMessages.meba9f13bd74e, "View all favorites") }} extraAction={favoritesLoading ? undefined : { href: `/rankings${localeQuery}`, label: rankingsText(locale, "rkTitle") }} />
            {!contentErrors.celebrities && celebrities.length > 0 && favoritesLoading ? (
              <div role="status" aria-label={t.myFavoritesLoading} aria-busy="true">
                <span className={styles.srOnly}>{t.myFavoritesLoading}</span>
                <div aria-hidden="true">
                  <div className={styles.favoriteSkeletonFilters}>{[0, 1, 2, 3].map(index => <span key={index} className={`${styles.stateSkeleton} ${styles.favoriteSkeletonChip}`} />)}</div>
                  <div className={styles.celebrityRail}>{[0, 1, 2].map(index => <div key={index} className={styles.celebrityCard}>
                    <div className={`${styles.celebrityMediaBox} ${styles.stateSkeleton} ${styles.favoriteSkeletonMedia}`} />
                    <div className={styles.celebrityInfo}><div className={styles.celebrityIdentity}><span className={`${styles.stateSkeleton} ${styles.favoriteSkeletonName}`} /><span className={`${styles.stateSkeleton} ${styles.favoriteSkeletonCount}`} /></div></div>
                  </div>)}</div>
                </div>
              </div>
            ) : null}
            {!contentErrors.celebrities && celebrities.length > 0 && !favoritesLoading ? <CreatorRoleFilterControl roles={availableCreatorRoles(celebrities)} value={role} onChange={changeRole} locale={locale} controls="home-creator-rail" ownedOnly={ownedOnly} onSelectOwned={selectOwned} /> : null}
            <ActivePreviewCoordinator initialActiveId={visibleCreators.find(creator => celebrityLives.some(live => live.celebritySlug === creator.slug && live.preview))?.slug ?? (previewQuery ? visibleCreators[0]?.slug ?? null : null)}>
            {contentErrors.celebrities || contentErrors.celebrityLives ? <ContentLoadError locale={locale} /> : null}
            {!contentErrors.celebrities && ownedOnly && personalization.state.status === "guest" ? <div className={styles.favoriteFilterState} role="status"><p>{t.myFavoritesGuest}</p><Link href={ownedLoginHref}>{t.signIn}</Link></div> : null}
            {!contentErrors.celebrities && ownedOnly && personalization.state.status === "authenticated-error" ? <div className={styles.favoriteFilterState} role="alert"><p>{t.myFavoritesError}</p><FanAction onClick={personalization.retry}>{t.retry}</FanAction></div> : null}
            {!contentErrors.celebrities && ownedOnly && personalization.state.status === "authenticated-ready" && visibleCreators.length === 0 ? <div className={styles.favoriteFilterState} role="status"><strong>{hasOwnedPassport ? t.myFavoritesUnavailable : t.myFavoritesEmpty}</strong><p>{hasOwnedPassport ? t.myFavoritesUnavailableHelp : t.myFavoritesHelp}</p><FanAction onClick={() => changeRole("all")}>{t.all}</FanAction></div> : null}
            {!contentErrors.celebrities && (!favoritesLoading || celebrities.length === 0) && (!ownedOnly || (personalization.state.status === "authenticated-ready" && visibleCreators.length > 0)) ? <div className={styles.celebrityCarousel}>
            <div id="home-creator-rail" ref={creatorRailRef} className={styles.celebrityRail} data-count={visibleCreators.length <= 2 ? visibleCreators.length : undefined} aria-label={t.celebrityList} onScroll={updateCreatorScroll}>
              {visibleCreators.map((celebrity) => {
                return (
                <article className={styles.celebrityCard} key={celebrity.slug}>
                  <Link className={styles.celebrityMediaBox} href={`${creatorHomeHref(celebrity.slug)}${localeQuery}` as Route} aria-label={locale === "ko" ? `${celebrity.name} ${t.detail}` : translate(locale, localizedMessages.m7c3e6608522c, "View {0} details", [celebrity.name])}>
                    <Suspense fallback={<CreatorPortrait locale={locale} slug={celebrity.slug} image={celebrity.image} sizes="(max-width: 767px) min(82vw, 288px), 240px" />}>
                      <HomeCreatorPreview celebrity={celebrity} locale={locale} celebrityLives={celebrityLives} previewQuery={previewQuery} />
                    </Suspense>
                  </Link>
                  <div className={styles.celebrityInfo}>
                    <h3>{celebrity.name}</h3>
                    <p className={styles.fanCount}>{formatLocalizedFanCount(locale, celebrity.fanCount)}</p>
                    <div className={styles.celebrityActions}>
                      <CreatorFanLink slug={celebrity.slug} name={celebrity.name} locale={locale} />
                      <div className={styles.socialLinks} role="group" aria-label={`${celebrity.name} ${locale === "ko" ? "소셜 채널" : translate(locale, localizedMessages.m81fb78c7ebd5, "social channels")}`}>
                        {celebrity.socialLinks.map((social) => <a className={styles.socialLink} href={social.url} target="_blank" rel="noreferrer" aria-label={`${celebrity.name} ${social.platform === "chzzk" && locale !== "ko" ? "CHZZK" : socialLabel[social.platform]} ${t.social}`} data-social-icon-only="true" data-platform={social.platform} key={social.platform}><Image src={social.platform === "chzzk" ? "/images/guest-home/chzzk.png" : `/images/guest-home/${social.platform}.svg`} alt="" width={20} height={20} aria-hidden="true" /></a>)}
                      </div>
                    </div>
                  </div>
                </article>
              )})}
              {celebrities.length === 0 ? <p role="status">{t.noCelebrities}</p> : null}
            </div>
            {creatorScroll.previous || creatorScroll.next ? (
              <nav className={styles.creatorControls} aria-label={locale === "ko" ? "최애 목록 이동" : translate(locale, localizedMessages.mdcf61c1a1ca5, "Browse creators")}>
                <button type="button" aria-label={locale === "ko" ? "이전 최애" : translate(locale, localizedMessages.me65af7523189, "Previous creators")} aria-controls="home-creator-rail" disabled={!creatorScroll.previous} onClick={() => moveCreators(-1)}><ChevronLeft /></button>
                <button type="button" aria-label={locale === "ko" ? "다음 최애" : translate(locale, localizedMessages.m0aab33b2d3dc, "Next creators")} aria-controls="home-creator-rail" disabled={!creatorScroll.next} onClick={() => moveCreators(1)}><ChevronRight /></button>
              </nav>
            ) : null}
            </div> : null}
            </ActivePreviewCoordinator>

          </section>

</>);
}
function HomeCreatorPreview({ celebrity, locale, celebrityLives, previewQuery }: { celebrity: PublishedCelebrity; locale: AppLocale; celebrityLives: readonly PublishedCelebrityLive[]; previewQuery?: HomeQueries["celebrityLives"] }) {
  const result = previewQuery ? use(previewQuery) : undefined;
  const lives = result?.status === "fulfilled" ? result.value : celebrityLives;
  const celebrityLive = lives.find(live => live.celebritySlug === celebrity.slug);
  return (<>                    {celebrityLive?.preview ? (
                      <ActivePreviewVideo
                        id={celebrity.slug}
                        mode="card"
                        preview={{
                          videoUrl: celebrityLive.preview.square.videoUrl,
                          posterUrl: celebrityLive.preview.square.posterUrl,
                          durationMs: celebrityLive.preview.durationMs,
                        }}
                      />
                    ) : (
                      <CreatorPortrait locale={locale} slug={celebrity.slug} image={celebrity.image} sizes="(max-width: 767px) min(82vw, 288px), 240px" />
                    )}</>);
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
/** The old "my fan activity" place: the ranking card (261107-2 U3, D3). The passport card moved to MY and the header. Same card on 390 (under the hero) and in the side panel. */
function HomePersonalization({ locale, placement }: GuestHomeProps & { placement: "mobile" | "desktop" }) {
  return placement === "mobile"
    ? <div className={styles.mobilePersonalization}><HomeRankingCard locale={locale} headingId="home-ranking-heading-mobile" /></div>
    : <HomeRankingCard locale={locale} headingId="home-ranking-heading-desktop" />;
}

type StreamingHomeProps = Pick<GuestHomeProps, "locale" | "initialOwnedOnly" | "initialRole"> & {
  queries: HomeQueries;
  publishedCreatorSlugs: Promise<readonly string[] | null>;
};

export function StreamingGuestHome({ queries, publishedCreatorSlugs, ...props }: StreamingHomeProps) {
  const fallbackProps = { ...props, celebrities: [], featuredLives: [] };
  const guide = <Suspense fallback={null}><StreamHomeGuide queries={queries} locale={props.locale} /></Suspense>;
  return <HomeOwnerProvider locale={props.locale} publishedCreatorSlugsPromise={publishedCreatorSlugs}>
    <HomeLayout locale={props.locale}
      community={<Suspense fallback={<HomeCommunityPreview locale={props.locale} />}><StreamHomeCommunity locale={props.locale} queries={queries} /></Suspense>}
      hero={<Suspense fallback={<HomeHero {...fallbackProps} homeBanners={[gggiHomeBanner(props.locale)]} elinaGuide={null} />}><StreamHomeHero {...props} queries={queries} /></Suspense>}
      creators={<Suspense fallback={<PersonalizationLoading quiet locale={props.locale} />}><StreamHomeCreators {...props} queries={queries} /></Suspense>}
      upcoming={<Suspense fallback={<PersonalizationLoading quiet locale={props.locale} />}><StreamHomeUpcoming {...props} queries={queries} /></Suspense>}
      guides={guide}
      mobile={<HomePersonalization {...fallbackProps} placement="mobile" />}
      desktop={<HomePersonalization {...fallbackProps} placement="desktop" />} />
  </HomeOwnerProvider>;
}

function StreamHomeHero({ queries, ...props }: Pick<StreamingHomeProps, "queries" | "locale">) {
  const result = use(queries.homeBanners);
  return <HomeHero {...props} celebrities={[]} featuredLives={[]}
    homeBanners={[gggiHomeBanner(props.locale), ...(result.status === "fulfilled" ? result.value : [])]}
    contentErrors={{ homeBanners: result.status === "rejected" }}
    elinaGuide={<Suspense fallback={<PersonalizationLoading quiet locale={props.locale} />}><StreamElinaGuide queries={queries} locale={props.locale} hero /></Suspense>} />;
}

function StreamHomeCreators({ queries, ...props }: Omit<StreamingHomeProps, "publishedCreatorSlugs">) {
  const result = use(queries.celebrities);
  return <HomeCreators {...props} celebrities={result.status === "fulfilled" ? result.value : []} featuredLives={[]}
    contentErrors={{ celebrities: result.status === "rejected" }} previewQuery={queries.celebrityLives} />;
}

/** The board preview gets the fan page images once the celebrity list has arrived; until then its rows keep the post icon. */
function StreamHomeCommunity({ queries, locale }: Pick<StreamingHomeProps, "queries" | "locale">) {
  const result = use(queries.celebrities);
  return <HomeCommunityPreview locale={locale} celebrities={result.status === "fulfilled" ? result.value : []} />;
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

function StreamHomeGuide({ queries, locale }: Pick<StreamingHomeProps, "queries" | "locale">) {
  return <HomeEntryCards locale={locale} celebrities={[]} elinaGuide={<Suspense fallback={null}><StreamElinaGuide queries={queries} locale={locale} /></Suspense>} />;
}

