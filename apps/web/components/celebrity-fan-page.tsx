"use client";
import {PopularPosts} from '@/features/groups/ui/popular-posts';
import {fanStories} from '@/features/groups/ui/home-copy';
import { CreatorBoardAside, type CreatorBoardEvent } from "@/features/groups/ui/creator-board-aside";
import { CreatorGroupHome } from "@/features/groups/ui/creator-group-home";
import { CreatorGroupCalendar } from "@/features/groups/ui/group-calendar";
import { CreatorGroupMembers,CreatorGroupEvents, CreatorGroupActivities, CreatorGroupRooms, CreatorGroupCollection } from "@/features/groups/ui/creator-group-header";
import groupStyles from "@/features/groups/ui/groups.module.css";
import groupHomeStyles from "@/features/groups/ui/creator-group-home.module.css";
import { useRetiredInfoTab } from "@/features/groups/ui/use-retired-info-tab";
import { CreatorPageFrame } from "@/features/groups/ui/group-page-frame";
import { useOptionalGroupPage } from "@/features/groups/ui/group-page-context";
import { TranslatedText } from "@/features/content-safety/ui/use-automatic-translation";

import { WAVE_FANPAGE_SLUG } from "@/features/fanpage/domain/wave-programs";
import { WaveNavigation } from "@/features/fanpage/ui/wave-navigation";
import { WaveFriends } from "@/features/fanpage/ui/wave-friends";
import { waveMissionsCopy } from "@/i18n/catalogs/features__fanpage__wave-missions";
import { WaveProgramsHome } from "@/features/fanpage/ui/wave-programs";
import { toContentLocale } from "@/i18n/locales";
import type { AppLocale } from "@/i18n/locales";
import { messages as localizedMessages } from "@/i18n/catalogs/components__celebrity-fan-page";
import { additionalLocales, translate } from "@/i18n/messages";
import { creatorHomeHref } from "@/features/creator/domain/creator-navigation";

import { useByUsAuth as usePrivy } from "@/features/auth/client/cognito-auth";
import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { ArrowRight, ArrowUpRight, BookOpen, Globe2 } from "lucide-react";
import { FanAppFrame, FanContentContainer } from "./fan-shell/fan-app-shell";
import { AuthIntentLink } from "./auth-intent-link";
import { useOwnedFanResource } from "./fan-ui/use-owned-fan-resource";
import { resolveCreatorHeroImage } from "./fan-ui/creator-image-config";
import { fanPostPageImage } from "./fan-ui/fan-post-page-image";
import { CreatorHeroPicture } from "./fan-ui/creator-hero-picture";
import { useWaveParticipantName } from "@/features/fanpage/ui/wave-access-boundary";
import { FanCommunity } from "@/features/fanpage/ui/fan-community";
import { ReactionAction } from "@/features/reaction/ui/reaction-action";
import { GggiEventEntry } from "@/features/fanpage/ui/gggi-event-entry";
import { GggiParticipationEntry } from "@/features/fanpage/ui/gggi-participation-entry";
import { Avatar, AvatarPlaceholder } from "@/features/profile/ui/avatar";
import { useAvatar } from "@/features/profile/ui/use-avatar";
import { mySummaryPath, mySummarySchema } from "@/features/my/domain/my-summary";
import { levelLabel } from "@/features/passport/domain/passport-read-model";
import { CelebrityMiniCalendar } from "@/features/fanpage/ui/celebrity-calendar";
import { LeaderboardPanel } from "@/features/fanpage/ui/leaderboard-panel";
import { FanScoreProgress } from "@/features/fanpage/ui/fan-score-progress";
import { FanTierBadge } from "@/features/rewards/ui/fan-tier-badge";
import { fanStageLabel } from "@/features/rewards/domain/fan-stage";
import { CertificationPanel } from "@/features/certification/ui/certification-panel";
import { CreatorLivePanel, RafflePanel, useCreatorRaffles } from "@/features/fanpage/ui/home-panels";
import { WaveLivePanel } from "@/features/fanpage/ui/wave-live";
import { WaveDraw } from "@/features/fanpage/ui/wave-draw";
import { WaveMediaFeed } from "@/features/fanpage/ui/wave-media";
import { PageNoticeModal } from "@/features/groups/ui/page-notice-modal";
import { raffleDiscoveryCopy } from "@/i18n/catalogs/features__benefit__ui__raffle-discovery";
import { CreatorFanIdentity } from "@/features/fanpage/ui/creator-fan-identity";
import { creatorIdentity } from "@/features/fanpage/domain/creator-identities";
import { useCheerEvent, CheerEventFeedback, CheerEventBanner, CheerEventDetail, CheerEventModal, CheerEventSidebar, type CheerEvent } from "@/features/fanpage/ui/cheer-event";
import { CreatorHomeHighlights } from "@/features/fanpage/ui/creator-home-highlights";
import { CreatorOfficialVideos } from "@/features/fanpage/ui/creator-official-videos";
import { CreatorNews, type NewsFilter } from "@/features/fanpage/ui/chzzk-posts";
import { chzzkChannelId } from "@/features/fanpage/domain/chzzk-posts";
import { pageViewIdempotencyKey, recordProductEventV1 } from "@/features/analytics/client/product-event-client";
import type { ContentLocale, PublishedCelebrity, PublishedCelebrityLive } from "@/server/content/content-domain";
import styles from "@/features/fanpage/ui/fanpage.module.css";
import { CreatorRolesText } from "./fan-ui/creator-roles";
import { FanAction } from "./fan-ui/fan-action";
import { FanSkeleton, FanSkeletonStatus } from "./fan-ui/fan-skeleton";
import { ElinaMissionEntry } from "@/features/live/ui/elina-mission-entry";
import { ElinaAttendanceEntry } from "@/features/live/ui/elina-attendance-entry";
import { FanTicketGuide } from "@/features/tickets/ui/fan-ticket-guide";
import { useByUsSession } from "./byus-session-provider";
import { FanPostFeed } from "@/features/fan-posts/ui/fan-post-feed";
import { CreatorMediaPanel, type CreatorMediaSelection } from "@/features/media/ui/creator-media-panel";
import { FAN_PAGE_TABS, boardHref, fanPageHref, parseFanPageTab, resolveBoardSection, resolveBoardSource, type BoardFeedSource, type BoardSection, type FanPageTab } from "@/features/fanpage/domain/board-navigation";
import { fanPageNavigationCopy } from "@/i18n/catalogs/features__fanpage__navigation";
import { fanPageBrandCopy } from "@/i18n/catalogs/features__fanpage__brand";
export { flattenLiveCatalog } from "@/features/fanpage/domain/live-catalog";

export type CelebrityFanTab = FanPageTab | "friends" | "community" | "media" | "notice" | "live" | "raffles" | "benefits";
const socialLabels = {
  ko: { instagram: "Instagram", youtube: "YouTube", tiktok: "TikTok", chzzk: "치지직" },
  en: { instagram: "Instagram", youtube: "YouTube", tiktok: "TikTok", chzzk: "CHZZK" },

  ...additionalLocales((translationLocale) => ({ instagram: "Instagram", youtube: "YouTube", tiktok: "TikTok", chzzk: localizedMessages.m912b89a327a1[translationLocale] }))
} as const;
const parseSummary = (body: unknown) => mySummarySchema.parse((body as { summary: unknown }).summary);

type CelebrityFanPageProps = { celebrity: PublishedCelebrity; locale: AppLocale; upcomingLive: PublishedCelebrityLive | null; initialCheerEvent?: CheerEvent | null; initialTab?: CelebrityFanTab; calendarMonth?: string; initialBoardSection?: BoardSection; initialBoardSource?: BoardFeedSource; initialNewsFilter?: NewsFilter; initialMediaFilter?: "photos" | "videos" | "replays"; instagramEnabled?: boolean; groupsEnabled?: boolean; onVideoSelect?:(media:CreatorMediaSelection)=>void;boardEvent?:CreatorBoardEvent;homeSchedule?:{label:string;note:string} };

/** 모임 기능이 켜진 페이지의 머리·접속 띠·탭은 `(page)/layout.tsx`의 프레임이 그린다. 라우트 밖에서 쓰이면 스스로 프레임을 두른다. wave와 기능이 꺼진 경로는 옛 히어로 그대로다. */
export function CelebrityFanPage(props: CelebrityFanPageProps) {
  const framed = useOptionalGroupPage();
  if (props.groupsEnabled && props.celebrity.slug !== WAVE_FANPAGE_SLUG && !framed) return <CreatorPageFrame slug={props.celebrity.slug} celebrity={props.celebrity} locale={props.locale} initialTab={props.initialTab}><CelebrityFanPageBody {...props} /></CreatorPageFrame>;
  return <CelebrityFanPageBody {...props} />;
}

function CelebrityFanPageBody({ celebrity, locale, upcomingLive, initialCheerEvent, initialTab = "home", calendarMonth, initialBoardSection, initialBoardSource, initialNewsFilter = "all", initialMediaFilter, groupsEnabled = false, onVideoSelect,boardEvent,homeSchedule }: CelebrityFanPageProps) {
  const auth = usePrivy();
  const router = useRouter();
  const query = useSearchParams();
  const framePage = useOptionalGroupPage();
  useRetiredInfoTab();
  const currentTab = framePage ? framePage.activeTab : groupsEnabled ? query?.get("tab") ?? initialTab : initialTab;
  const { ready, authenticated, getAccessToken } = auth;
  const session = useByUsSession();
  const sessionReady = ready && session.ready;
  const requestAuthenticated = sessionReady && authenticated;
  const isWave = celebrity.slug === WAVE_FANPAGE_SLUG;
  // A board row without a photo shows this page's own image instead of the document icon.
  const boardRowImage = fanPostPageImage({ slug: celebrity.slug, src: celebrity.image.url, photos: celebrity.image.photos, position: celebrity.image.position });
  const waveFriends = isWave && currentTab === "friends";
  const isBrand = celebrity.roles.includes("brand");
  const hasProfileSummary = isBrand || celebrity.slug === "wena" || celebrity.slug === "hyunji";
  const identity = creatorIdentity(celebrity.slug);
  const ownSummary = useOwnedFanResource(framePage ? null : mySummaryPath(toContentLocale(locale)), parseSummary, auth);
  const my = framePage?.summary ?? ownSummary;
  const avatar = useAvatar();
  const raffles = useCreatorRaffles(celebrity.slug, locale);
  // A published raffle result is announced as a board notice row and one dismissible modal, not a band across the page.
  const latestResult = raffles.state.status === "ready" ? raffles.state.data.filter(raffle => raffle.resultsPublishedAt && raffle.status !== "cancelled").map(raffle => raffle.resultsPublishedAt as string).sort().at(-1) : undefined;
  const resultNotice = latestResult ? { id: `raffle-results-${latestResult}`, title: raffleDiscoveryCopy[locale].title, author: "kyaa", date: latestResult, href: `/my/raffles?locale=${locale}` } : null;
  const cheerEvent = useCheerEvent(celebrity.slug, locale, initialCheerEvent);
  const eventProps = cheerEvent.event ? { event: cheerEvent.event, slug: celebrity.slug, name: celebrity.name, locale } : null;
  const selectedTab = parseFanPageTab(currentTab);
  const tab = !groupsEnabled && ["rooms", "activities", "news", "collection", "calendar", "members"].includes(selectedTab) ? "home" : selectedTab;
  const boardSection = groupsEnabled ? resolveBoardSection(currentTab, query?.get("section") ?? initialBoardSection) : initialBoardSection ?? resolveBoardSection(initialTab, undefined);
  const boardSource = groupsEnabled ? resolveBoardSource(currentTab, query?.get("source") ?? initialBoardSource) : initialBoardSource ?? resolveBoardSource(initialTab, undefined);
  const news = groupsEnabled ? query?.get("news") : null;
  const newsFilter:NewsFilter = news==='all'||news==='notice'||news==='artist_post'||news==='chzzk'?news:initialNewsFilter;
  const media = groupsEnabled ? query?.get("media") : null;
  const mediaFilter = media==='photos'||media==='videos'||media==='replays'?media:initialMediaFilter;
  const currentMonth = groupsEnabled ? query?.get("month") ?? calendarMonth : calendarMonth;
  const navigation = fanPageNavigationCopy(locale);
  const tabsRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = tabsRef.current, active = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !active) return;
    const bounds = nav.getBoundingClientRect(), item = active.getBoundingClientRect();
    if (item.left < bounds.left || item.right > bounds.right) {
      nav.scrollLeft += item.left - bounds.left - (nav.clientWidth - active.clientWidth) / 2;
    }
  }, [tab, locale]);
  useEffect(() => {
    if (window.location.hash === "#cheers") router.replace(boardHref(celebrity.slug, locale, { source: "fans" }), { scroll: false });
  }, [celebrity.slug, locale, router]);
  const creator = my.state.status === "ready" ? my.state.data.creators.find((item) => item.celebrity.slug === celebrity.slug) : undefined;
  const waveParticipantName = useWaveParticipantName();
  const nickname = isWave ? waveParticipantName : my.state.status === "ready" ? my.state.data.profile.nickname : null;
  const passport = creator?.passport;
  const stage = passport?.stageProgress;
  const stageName = stage ? fanStageLabel(locale, stage.current) : passport ? levelLabel(locale, passport.tier) : null;
  const ticketBalance = requestAuthenticated && my.state.status === "ready" ? creator?.ticketBalance ?? 0 : null;
  const tabHref = (value: FanPageTab): string => value === "board" ? String(boardHref(celebrity.slug, locale)) : String(fanPageHref(celebrity.slug, locale, value));
  const portrait = (size: number) => avatar.state.status === "ready" ? <Avatar avatar={avatar.state.avatar} imageUrl={avatar.state.imageUrl} label="" size={size} /> : <AvatarPlaceholder size={size} />;
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void (async () => {
      const token = requestAuthenticated ? await getAccessToken() : null;
      if (cancelled) return;
      const ownerId = token ? session.ownerId ?? auth.user?.id : null;
      if (token && !ownerId) return;
      const idempotencyKey = await pageViewIdempotencyKey("creator_page_view", `/c/${celebrity.slug}`, ownerId ?? null);
      if (cancelled) return;
      await recordProductEventV1({ eventName: "creator_page_view", celebrityId: null, liveEventId: null, missionId: null, benefitId: null, source: "fan.creator.detail", idempotencyKey, properties: { celebritySlug: celebrity.slug } }, token);
    })().catch(() => undefined);
    return () => { cancelled = true; };
  }, [ready, requestAuthenticated, getAccessToken, celebrity.slug, auth.user?.id, session.generation, session.ownerId]);
  const community = sessionReady ? <><ReactionAction slug={celebrity.slug} locale={locale} variant="compact" showRewardDialog={celebrity.slug !== "gggi"} /><FanCommunity slug={celebrity.slug} locale={locale} /></> : null;
  const hero = resolveCreatorHeroImage(celebrity.slug, celebrity.image);
  const verifyLink = <AuthIntentLink className={styles.primaryButton} locale={locale} input={{ sourcePath: `/c/${celebrity.slug}/verify`, sourceQuery: `?locale=${locale}`, actionType: "START_FAN_VERIFICATION", targetType: "celebrity", targetId: celebrity.slug }}>{locale === "ko" ? "퀴즈 풀고 팬 인증하기" : translate(locale, localizedMessages.m58e2f1f8977e, "Verify fandom")}<ArrowRight aria-hidden="true" /></AuthIntentLink>;
  const channelId = chzzkChannelId(celebrity.socialLinks);
  const officialPostLabel = isBrand ? fanPageBrandCopy[locale].officialPost : undefined;
  const boardIntro = isBrand ? fanPageBrandCopy[locale].intro(celebrity.name) : undefined;
  const loginReturnTo: string = tab === "home" ? `${creatorHomeHref(celebrity.slug)}?locale=${locale}`
    : tab === "board" ? String(boardHref(celebrity.slug, locale, { section: boardSection, source: boardSource, newsFilter: newsFilter, mediaFilter: mediaFilter }))
    : String(fanPageHref(celebrity.slug, locale, tab));
  const shell = (content: ReactNode) => framePage ? <>{content}</> : <FanAppFrame locale={locale} groupsEnabled={groupsEnabled} currentPath={groupsEnabled&&!isWave?"/pages/groups":undefined} mainId="celebrity-detail-main" actionsAreIdentity={sessionReady && auth.authenticated} actions={sessionReady && auth.authenticated ? <Link className={styles.headerIdentity} href={`/my?locale=${locale}`}>{portrait(36)}<span>{nickname ?? "MY"}</span></Link> : sessionReady ? <Link className={styles.headerLogin} href={`/login?locale=${locale}&returnTo=${encodeURIComponent(loginReturnTo)}` as Route}>{locale === "ko" ? "로그인" : translate(locale, localizedMessages.m4ec129dd4b3e, "Sign in")}</Link> : undefined}>
    <FanContentContainer as="main" id="celebrity-detail-main" className={`${styles.page} ${groupsEnabled ? (isBrand ? groupStyles.page : groupStyles.creatorPage) : ""}`} tabIndex={-1}>{content}</FanContentContainer></FanAppFrame>;
  return shell(<>
      {resultNotice ? <PageNoticeModal locale={locale} storageKey={`raffle-results:${celebrity.slug}:${resultNotice.date}`} title={raffleDiscoveryCopy[locale].title} description={raffleDiscoveryCopy[locale].description} actionLabel={raffleDiscoveryCopy[locale].action} actionHref={resultNotice.href} /> : null}
      {framePage ? null : <section className={styles.hero} data-artist-identity={Boolean(identity) || undefined} data-brand={isBrand || undefined} data-gggi={celebrity.slug === "gggi" || undefined} data-wave={celebrity.slug === WAVE_FANPAGE_SLUG || undefined} data-dedicated-hero={!isBrand && hero ? celebrity.slug : undefined} data-outbound-campaign={celebrity.slug} data-outbound-placement="fanpage_hero" style={{ "--hero-desktop-position": hero?.desktopPosition ?? celebrity.image.position, "--hero-mobile-position": hero?.mobilePosition ?? celebrity.image.position, "--hero-desktop-fit": isBrand ? "contain" : hero?.desktopFit ?? "cover", backgroundColor: hero?.background } as CSSProperties} aria-labelledby="celebrity-heading">
        {!isWave && <CreatorHeroPicture locale={locale} slug={celebrity.slug} image={celebrity.image} className={styles.heroPicture} priority />}
        {isWave && <Image className={styles.waveVenuePhoto} src="/images/kyaa-wave/dragon-hill-lodge-exterior.jpg" alt="Dragon Hill Lodge" width={768} height={512} sizes="(min-width: 1440px) 720px, (min-width: 1024px) 54vw, (min-width: 768px) calc(100vw - 112px), calc(100vw - 80px)" priority />}
        <div className={styles.scrim} aria-hidden="true" />
        <div className={styles.heroContent}><p className={styles.eyebrow}>KYAA FAN PAGE</p><CreatorFanIdentity slug={celebrity.slug} name={celebrity.name} locale={locale} /><CreatorRolesText roles={celebrity.roles} locale={locale} />{hasProfileSummary && <p><TranslatedText text={celebrity.summary} locale={locale} /></p>}{celebrity.ticketUrl && <div className={styles.heroTicketAction} data-outbound-kind="ticket"><FanAction href={celebrity.ticketUrl} external variant="primary" fullWidth ariaLabel={`${fanPageBrandCopy[locale].ticket}, ${locale === "ko" ? "새 창" : translate(locale, localizedMessages.me1f5c62bd1d6, "new window")}`} trailingIcon={<ArrowUpRight />}>{fanPageBrandCopy[locale].ticket}</FanAction></div>}{isWave && <><p>{waveMissionsCopy(locale).description}</p><FanAction href={`/${WAVE_FANPAGE_SLUG}?locale=${locale}#wave-missions`} variant="primary" trailingIcon={<ArrowRight />}>{waveMissionsCopy(locale).title}</FanAction></>}<div className={styles.socials}>{isBrand && !isWave && celebrity.websiteUrl && <a href={celebrity.websiteUrl} target="_blank" rel="noopener noreferrer" aria-label={`${fanPageBrandCopy[locale].officialWebsite}, ${locale === "ko" ? "새 창" : translate(locale, localizedMessages.me1f5c62bd1d6, "new window")}`} data-outbound-kind="website"><Globe2 aria-hidden="true" /><span>{fanPageBrandCopy[locale].website}</span></a>}{celebrity.socialLinks.map((social) => { const socialLabel = socialLabels[locale][social.platform]; return <a key={social.platform} href={social.url} target="_blank" rel="noopener noreferrer" aria-label={`${socialLabel}, ${locale === "ko" ? "새 창" : translate(locale, localizedMessages.me1f5c62bd1d6, "new window")}`} data-platform={social.platform} data-outbound-kind="social"><Image src={social.platform === "chzzk" ? "/images/guest-home/chzzk.png" : `/images/guest-home/${social.platform}.svg`} alt="" width={20} height={20} /><span>{socialLabel}</span></a>; })}</div>{identity ? <div className={styles.artistCommunity}>{community}</div> : community}</div>
      </section>}
      <ElinaAttendanceEntry celebritySlug={celebrity.slug} locale={locale} />
      {!groupsEnabled || isWave ? isWave ? <WaveNavigation locale={locale} active={waveFriends ? "friends" : tab === "home" ? "home" : tab === "events" ? "entries" : tab === "board" ? boardSection === "feed" ? "introductions" : boardSection : undefined} /> : <nav id="celebrity-content" ref={tabsRef} className={styles.tabs} aria-label={locale === "ko" ? `${celebrity.name} 팬페이지 메뉴` : translate(locale, localizedMessages.m0f2000ce3e28, "{0} fan page menu", [celebrity.name])}>{FAN_PAGE_TABS.map((value) => <Link key={value} href={tabHref(value) as Route} aria-current={tab === value ? "page" : undefined}>{value === "events" && raffles.available.length > 0 ? <span className={styles.availableRaffleTab}>{navigation.main[value]}{" "}<span>{raffles.available.length}</span></span> : navigation.main[value]}</Link>)}</nav> : null}
      {eventProps && <CheerEventModal key={`${eventProps.event.campaignId}:${celebrity.slug}`} {...eventProps} enabled={tab !== "events"} />}
      {tab === "home" && eventProps && <CheerEventBanner {...eventProps} />}
      {!groupsEnabled && !isWave && tab === "board" && <nav className={styles.boardTabs} aria-label={navigation.boardMenu}>{(["feed", "media", "live"] as const).map((section) => <Link key={section} href={boardHref(celebrity.slug, locale, { section })} aria-current={boardSection === section ? "page" : undefined}>{navigation.board[section]}</Link>)}</nav>}
      {tab === "home" && celebrity.slug === "gggi" && <GggiParticipationEntry locale={locale} />}
      {!groupsEnabled && tab === "home" && celebrity.slug !== "gggi" && celebrity.slug !== WAVE_FANPAGE_SLUG && <section className={`${styles.fanbar} ${passport ? styles.ownedFanbar : ""}`} aria-label={locale === "ko" ? "내 팬 활동" : translate(locale, localizedMessages.mfd82d54cca54, "My fan activity")}>
        {!sessionReady || (auth.authenticated && my.state.status === "loading") ? <><FanSkeleton width="60%" height={16} /><FanSkeletonStatus locale={locale} /></> : auth.authenticated && my.state.status === "error" ? <p role="alert">{locale === "ko" ? "내 팬 활동을 불러오지 못했어요." : translate(locale, localizedMessages.m0aea4924b59e, "Couldn't load your fan activity.")} <FanAction variant="text" onClick={my.retry}>{locale === "ko" ? "다시 시도" : translate(locale, localizedMessages.m99f026b1d3a8, "Retry")}</FanAction></p> : passport ? <>
          <div className={styles.fanIdentity}>{portrait(48)}<strong>{nickname ?? (locale === "ko" ? "내 팬 활동" : translate(locale, localizedMessages.m33aabe47ea2a, "My activity"))}</strong></div>
          <div className={styles.fanActions}><FanTicketGuide creatorSlug={celebrity.slug} creatorName={celebrity.name} locale={locale} compact checkinOnly /><span className={styles.tier} data-tier={passport.tier}><FanTierBadge tier={passport.tier} stageKey={stage?.current.key} locale={locale} size={32} />{stageName}</span></div>
          <div className={styles.fanProgress}>
            <div className={styles.progressHeading}>
              <span>{stage ? stage.next ? <>{locale === "ko" ? `${fanStageLabel(locale, stage.next)}까지` : translate(locale, localizedMessages.m50ddf6278ab0, "To {0}", [fanStageLabel(locale, stage.next)])} <strong>{stage.remaining.toLocaleString(locale)}{locale === "ko" ? "점" : translate(locale, localizedMessages.m630bc8843593, " points")}</strong></> : (locale === "ko" ? "최고 단계 달성" : translate(locale, localizedMessages.m29ba29df317d, "Top stage reached")) : passport.tier === "Diamond" ? (locale === "ko" ? "최고 등급 달성" : translate(locale, localizedMessages.m499225dbee28, "Top tier reached")) : <>{locale === "ko" ? "다음 등급까지" : translate(locale, localizedMessages.mebc103264c9f, "To next tier")} <strong>{passport.remainingToNextTier.toLocaleString(locale)}{locale === "ko" ? "점" : translate(locale, localizedMessages.m630bc8843593, " points")}</strong></>}</span>
              <Link className={styles.passportLink} href={`/passports/${passport.id}?locale=${locale}`}><BookOpen aria-hidden="true" />{locale === "ko" ? "내 패스포트" : translate(locale, localizedMessages.m416360f1aadc, "My Passport")}<ArrowRight aria-hidden="true" /></Link>
            </div>
            <FanScoreProgress key={passport.id} passport={passport} locale={locale} />
          </div>
        </> : <>{verifyLink}</>}
      </section>}
      <div className={styles.content}>
        {groupsEnabled&&!isWave&&tab==="members"?<CreatorGroupMembers celebrity={celebrity} locale={locale}/>:groupsEnabled&&!isWave&&tab==="calendar"?<CreatorGroupCalendar slug={celebrity.slug} locale={locale} month={currentMonth}/>:groupsEnabled&&!isWave&&tab==="home"?<CreatorGroupHome schedule={homeSchedule} onVideoSelect={onVideoSelect} celebrity={celebrity} locale={locale} channelId={channelId} passportId={passport?.id} owned={creator}/>:groupsEnabled&&!isWave&&isBrand&&tab==="events"?<CreatorGroupEvents slug={celebrity.slug} locale={locale}/>:groupsEnabled && tab === "activities" ? <CreatorGroupActivities slug={celebrity.slug} locale={locale}/> : groupsEnabled && tab === "rooms" ? <CreatorGroupRooms slug={celebrity.slug} locale={locale} initialRoomId={query?.get("room")??undefined}/> : groupsEnabled && tab === "news" ? <CreatorNews slug={celebrity.slug} locale={locale} initialFilter="all" channelId={channelId} officialPostLabel={officialPostLabel}/> : groupsEnabled && tab === "collection" ? <CreatorGroupCollection slug={celebrity.slug} locale={locale}/> : waveFriends ? <WaveFriends locale={locale} /> : tab === "home" ? celebrity.slug === WAVE_FANPAGE_SLUG ? <WaveProgramsHome locale={locale} /> : <>{sessionReady ? <ElinaMissionEntry celebritySlug={celebrity.slug} locale={locale} /> : null}{!isBrand && <CreatorHomeHighlights celebrity={celebrity} locale={locale} channelId={channelId} />}{(celebrity.slug !== "gggi" || raffles.available.length > 0) && (isBrand || raffles.state.status !== "ready" || raffles.available.length > 0) && <RafflePanel slug={celebrity.slug} name={celebrity.name} locale={locale} preview ticketBalance={ticketBalance} resource={raffles} />}<div className={styles.homeGrid}><div className={styles.mainColumn}>
          <CreatorNews key={`${celebrity.slug}:${newsFilter}:home`} slug={celebrity.slug} locale={locale} initialFilter={newsFilter} channelId={channelId} officialPostLabel={officialPostLabel} />
        </div><aside className={styles.sideColumn}>{eventProps && <CheerEventSidebar {...eventProps} />}<CelebrityMiniCalendar key={celebrity.slug} celebrity={celebrity} locale={locale} upcomingLive={upcomingLive} /></aside></div></>
        : tab === "board" ? boardSection === "feed" ? <div className={groupsEnabled&&!isWave?`${groupStyles.creatorPostLayout} ${groupHomeStyles.noTopGap}`:undefined}><FanPostFeed pinnedNotices={resultNotice ? [resultNotice] : undefined} pageImage={boardRowImage} composeIntent={groupsEnabled&&boardSource==="fans"&&query?.get("compose")==="1"} composeReturnTo={boardHref(celebrity.slug,locale,{source:"fans",compose:true})} onComposeConsumed={()=>{const params=new URLSearchParams(window.location.search);params.delete("compose");router.replace(`${window.location.pathname}?${params}${window.location.hash}` as Route,{scroll:false});}} slug={celebrity.slug} creatorName={celebrity.name} locale={locale} source={boardSource} newsFilter={newsFilter} returnTo={boardHref(celebrity.slug, locale, { source: boardSource, newsFilter: newsFilter })} compact={groupsEnabled&&!isWave} hideHeading={!groupsEnabled} headingTitle={groupsEnabled?fanStories[locale]:undefined} beforeFeed={groupsEnabled?<PopularPosts slug={celebrity.slug} locale={locale} pageImage={boardRowImage}/>:undefined} introduction={isWave} intro={groupsEnabled&&!isWave?"":boardIntro} officialPostLabel={officialPostLabel} allowMembers={!isBrand} />{groupsEnabled&&!isWave&&<CreatorBoardAside event={boardEvent} slug={celebrity.slug} locale={locale} owned={creator} passportId={passport?.id}/>}</div> : boardSection === "media" ? isWave ? <WaveMediaFeed locale={locale} /> : <div className={styles.mediaLayout}>{!groupsEnabled&&<CreatorOfficialVideos slug={celebrity.slug} locale={locale} />}<CreatorMediaPanel onVideoSelect={onVideoSelect} slug={celebrity.slug} locale={locale} channelId={channelId} socialLinks={celebrity.socialLinks} /></div> : isWave ? <WaveLivePanel locale={locale} /> : <CreatorLivePanel slug={celebrity.slug} locale={locale} /> : tab === "certifications" ? <CertificationPanel slug={celebrity.slug} locale={locale} /> : tab === "events" ? isWave ? <WaveDraw locale={locale} /> : celebrity.slug === "gggi" ? <><GggiEventEntry locale={locale} />{raffles.state.status === "ready" && raffles.state.data.length > 0 && <RafflePanel slug={celebrity.slug} name={celebrity.name} locale={locale} ticketBalance={ticketBalance} resource={raffles} />}</> : <><CheerEventFeedback {...cheerEvent} locale={locale} />{eventProps && <CheerEventDetail {...eventProps} onPosted={cheerEvent.refresh} />}<RafflePanel slug={celebrity.slug} name={celebrity.name} locale={locale} ticketBalance={ticketBalance} resource={raffles} /></> : <LeaderboardPanel slug={celebrity.slug} locale={locale} />}
      </div>
</>);
}
