"use client";

import { walletCopy } from "@/features/group-wallet/ui/copy";
import { supportCopy } from "@/features/support/ui/copy";
import { socialCopy } from "@/features/group-social/copy";
import { groupOwnReportsCopy } from "@/features/groups/ui/group-own-reports-copy";
import { useGroupsRelease } from "@/features/groups/ui/groups-release";
import { toContentLocale } from "@/i18n/locales";
import { type AppLocale } from "@/i18n/locales";
import { messages as localizedMessages } from "@/i18n/catalogs/features__my__ui__my-screen";
import { additionalLocales, translate } from "@/i18n/messages";
import { creatorHomeHref } from "@/features/creator/domain/creator-navigation";

import { CommunityStampCollection } from "@/features/community-stamps/ui/community-stamp-collection";
import { useCommunityStamps } from "@/features/community-stamps/ui/use-community-stamps";

import { creatorRafflesHref } from "@/features/benefit/domain/raffle-navigation";
import { RaffleResultsNotice } from "@/features/benefit/ui/raffle-results-notice";
import { raffleDiscoveryCopy } from "@/i18n/catalogs/features__benefit__ui__raffle-discovery";
import { boundFirstLikeCount } from "../../passport/domain/first-like-stamp";

import { useByUsAuth as usePrivy } from "@/features/auth/client/cognito-auth";
import { ArrowRight, Bell, BookOpen, CalendarDays, Check, Gift, History, ListChecks, MessageSquare, MessagesSquare, Minus, Pencil, Plus, RotateCcw, Settings, Sparkles, Ticket } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useOwnedFanResource } from "../../../components/fan-ui/use-owned-fan-resource";
import { fanLoginHref } from "@/components/login-href";
import { FanSkeleton, FanSkeletonStatus } from "@/components/fan-ui/fan-skeleton";
import { FanTag } from "@/components/fan-ui/fan-tag";
import { myHomeText } from "./my-home-copy";
import { MyFavorites, MyFavoritesSkeleton, MyGuestFavorites } from "./my-favorites";
import { MyGuestPassportCard, MyPassportCard, MyPassportCardSkeleton, passportTierName } from "./my-passport-card";
import { MyRaffleNotice } from "./my-raffle-notice";
import { PointsUseSoon } from "@/features/group-wallet/ui/points-use-soon";
import { MyShortcuts, type MyShortcut } from "./my-shortcuts";
import { MyGuestWalletCard, MyWalletCard, MyWalletCardSkeleton } from "./my-wallet-card";
import { DukjilProvider } from "@/features/dukjil/ui/dukjil-provider";
import { CreatorImage } from "@/components/fan-ui/creator-image";
import { FanAppFrame, FanContentContainer, type FanLocale } from "@/components/fan-shell/fan-app-shell";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanState } from "@/components/fan-ui/fan-state";
import { FanMotionIcon } from "@/components/fan-ui/fan-motion-icon";
import type { MyReward } from "../../benefit/domain/my-reward";
import { raffleListSchema } from "../../benefit/domain/raffle";
import { useFanpageResource } from "../../fanpage/ui/use-fanpage-resource";
import { levelLabel } from "../../passport/domain/passport-read-model";
import { mySummarySchema, prioritizeReservedLives, type MySummary } from "../domain/my-summary";
import { FanHeading, FanSectionHeader } from "../../../components/fan-ui/fan-heading";

import { fanStageLabel } from "../../rewards/domain/fan-stage";
import { FAN_TICKET_CREATOR_SLUGS } from "@/features/tickets/domain/fan-ticket-activity";
import { FanTierBadge } from "../../rewards/ui/fan-tier-badge";
import { FanSurface, fanUtilityCanvasClassName } from "../../../components/fan-ui/fan-surface";
import { Avatar, AvatarPlaceholder } from "../../profile/ui/avatar";
import { useAvatar } from "../../profile/ui/use-avatar";
import { withLocalePath } from "../../../components/locale-path";
import { nextRaffleBoundary, selectOpenRaffles, type MyCreator, type PassportCreator } from "../domain/my-progress";
import { collectionGroupTitle, groupRecentCollection } from "../domain/recent-collection";
import { MyLiveCountdown } from "./my-live-countdown";
import styles from "./my-screen.module.css";
import { participationCopy } from "@/i18n/catalogs/features__schedules__ui__participation";
import { personalCopy } from "@/i18n/catalogs/features__my__ui__personal-copy";
import { useByUsSession } from "@/components/byus-session-provider";
import { readSelectedBiasSlug } from "@/features/selected-bias/ui/use-selected-bias";

const copy = {
  ko: {
    title: "MY", profileSummary: "내 팬 활동",
    
    login: "로그인하기", loading: "팬 활동을 불러오는 중이에요.", error: "팬 활동을 불러오지 못했어요.", retry: "다시 시도",
    creators: "내 최애", creatorsHelp: "크리에이터별 패스포트와 응모권 잔액을 확인하세요.",
    noCreators: "아직 등록한 최애가 없어요.", findCreator: "최애 찾기", live: "내 예약 LIVE", upcoming: "예약 완료",
    history: "지난 LIVE", noLive: "예약한 LIVE가 없어요.", browseLive: "LIVE 둘러보기", rewards: "받은 혜택",
    collection: "최근 수집",
    passports: "내 패스포트", stamps: "도장", collectibles: "디지털 기념품", noCollection: "아직 수집한 기록이 없어요.",
    notifications: "새 알림", settings: "설정", tickets: "응모권", firstReaction: "첫 반응",
    avatarSettings: "프로필 수정",
    destinations: "내 활동 바로가기", reservedLive: "예약한 LIVE", noReservedLive: "예약 없음", reservationCount: (count: number) => `예약 ${count}건`, allCollection: "전체 보기",
    benefitEntry: "응모·혜택", benefitSummary: (benefits: number, entries: number) => `혜택 ${benefits} · 응모 내역 ${entries}`,
    passportSummary: (count: number) => `발급 ${count}개`,
    allLive: "전체 LIVE 보기", fanTier: (name: string) => `${name} 팬등급`, myPassport: "내 패스포트",
    ticketPanel: (name: string) => `${name} 응모권`, allRaffles: "전체 래플", raffleOpen: "응모 진행 중", raffleDraw: "추첨", raffleView: "래플 자세히 보기",
    raffleEmpty: "현재 열려 있는 래플이 없어요.",
    nextAction: "다음 팬 활동", noMission: "새 인증 미션을 기다리고 있어요.", viewLive: "LIVE 일정 보기", startPassport: "팬 인증 시작하기",
    missionLoading: "다음 활동을 확인하는 중이에요.", missionError: "다음 활동을 불러오지 못했어요.", manualReward: "승인 후 지급",
    tierHelp: "함께한 활동이 나의 등급이 돼요.", highestTier: "최고 등급을 달성했어요.", toNextTier: "까지",
  },
  en: {
    title: "MY", profileSummary: "My fan activity",
    
    login: "Sign in", loading: "Loading your fan activity.", error: "We couldn’t load your fan activity.", retry: "Try again",
    creators: "My favorites", creatorsHelp: "Check each Fan Passport and its raffle ticket balance.",
    noCreators: "No favorites added yet.", findCreator: "Find favorites", live: "My reserved LIVE", upcoming: "Reserved",
    history: "Past LIVE", noLive: "No reserved LIVE events.", browseLive: "Browse LIVE", rewards: "My rewards",
    collection: "Recent collection",
    passports: "Fan Passports", stamps: "Stamps", collectibles: "Collectibles", noCollection: "Nothing collected yet.",
    notifications: "New alerts", settings: "Settings", tickets: "Raffle tickets", firstReaction: "First Reaction",
    avatarSettings: "Edit profile",
    destinations: "My activity shortcuts", reservedLive: "Reserved LIVE", noReservedLive: "No reservations", reservationCount: (count: number) => `${count} reserved`, allCollection: "View all",
    benefitEntry: "Entries & rewards", benefitSummary: (benefits: number, entries: number) => `${benefits} rewards · ${entries} entries`,
    passportSummary: (count: number) => `${count} issued`,
    allLive: "View all LIVE", fanTier: (name: string) => `${name} fan tier`, myPassport: "My Passport",
    ticketPanel: (name: string) => `${name} raffle tickets`, allRaffles: "All raffles", raffleOpen: "Raffle open", raffleDraw: "winners", raffleView: "View raffle",
    raffleEmpty: "No raffles are open right now.",
    nextAction: "Next fan activity", noMission: "There are no new verification missions.", viewLive: "View LIVE schedule", startPassport: "Start fan verification",
    missionLoading: "Checking your next activity.", missionError: "We couldn’t load your next activity.", manualReward: "Granted after approval",
    tierHelp: "Your fan activities determine your fan tier.", highestTier: "You reached the highest tier.", toNextTier: "to",
  },

  ...additionalLocales((translationLocale) => ({
    title: "MY", profileSummary: localizedMessages.ma73150e96afb[translationLocale],
    
    login: localizedMessages.m31d61c3cc601[translationLocale], loading: localizedMessages.m03449d54333c[translationLocale], error: localizedMessages.mff567c545ea0[translationLocale], retry: localizedMessages.mb0a068fe8172[translationLocale],
    creators: localizedMessages.madfe76fc03d1[translationLocale], creatorsHelp: localizedMessages.m6c62da6f7772[translationLocale],
    noCreators: localizedMessages.mee9c567663d7[translationLocale], findCreator: localizedMessages.m0af6a3088bb5[translationLocale], live: localizedMessages.m3190c29eddca[translationLocale], upcoming: localizedMessages.m0de14525bbe6[translationLocale],
    history: localizedMessages.m9337541996b3[translationLocale], noLive: localizedMessages.me7c44c442e4d[translationLocale], browseLive: localizedMessages.m2f6fea140b72[translationLocale], rewards: localizedMessages.mfd30c394dc05[translationLocale],
    collection: localizedMessages.ma2be6d1414b6[translationLocale],
    passports: localizedMessages.m6a7992f4b40d[translationLocale], stamps: localizedMessages.mfadefc3042da[translationLocale], collectibles: localizedMessages.m9e88a74ef12b[translationLocale], noCollection: localizedMessages.mdb4ac0204c7f[translationLocale],
    notifications: localizedMessages.m802d447f3402[translationLocale], settings: localizedMessages.m980e9a086e5d[translationLocale], tickets: localizedMessages.m07a852a47833[translationLocale], firstReaction: localizedMessages.m596fafbf40db[translationLocale],
    avatarSettings: localizedMessages.m404563ff319a[translationLocale],
    destinations: localizedMessages.m9a63f0998069[translationLocale], reservedLive: localizedMessages.m777735bc5ff8[translationLocale], noReservedLive: localizedMessages.m3a6a27c27b16[translationLocale], reservationCount: (count: number) => translate(translationLocale, localizedMessages.m24c92327a966, "{0} reserved", [count]), allCollection: localizedMessages.mae5642911b86[translationLocale],
    benefitEntry: localizedMessages.m0be13a5224c5[translationLocale], benefitSummary: (benefits: number, entries: number) => translate(translationLocale, localizedMessages.m2c34e72dfaa2, "{0} rewards · {1} entries", [benefits, entries]),
    passportSummary: (count: number) => translate(translationLocale, localizedMessages.maab7aa3a3792, "{0} issued", [count]),
    allLive: localizedMessages.m11773623921f[translationLocale], fanTier: (name: string) => translate(translationLocale, localizedMessages.m5bf91e65ee9a, "{0} fan tier", [name]), myPassport: localizedMessages.mbd0f17ab2ba5[translationLocale],
    ticketPanel: (name: string) => translate(translationLocale, localizedMessages.m7c96f7637dc5, "{0} raffle tickets", [name]), allRaffles: localizedMessages.mf0c1202ac4b6[translationLocale], raffleOpen: localizedMessages.mff5f7e4cc18a[translationLocale], raffleDraw: localizedMessages.mc501090136ec[translationLocale], raffleView: localizedMessages.mea5a5d7215d9[translationLocale],
    raffleEmpty: localizedMessages.m365139d906a3[translationLocale],
    nextAction: localizedMessages.m9e00b28f1ca9[translationLocale], noMission: localizedMessages.ma1e80483c12b[translationLocale], viewLive: localizedMessages.m75589d2732b7[translationLocale], startPassport: localizedMessages.md784e78b6f0d[translationLocale],
    missionLoading: localizedMessages.m05039f1121a7[translationLocale], missionError: localizedMessages.ma96afa6f171f[translationLocale], manualReward: localizedMessages.m245b2551a6c7[translationLocale],
    tierHelp: localizedMessages.m62ee926264d3[translationLocale], highestTier: localizedMessages.m0f473985b8a3[translationLocale], toNextTier: localizedMessages.mc031f5c28aae[translationLocale],
  }))
} as const;

const parseSummaryResponse = (body: unknown) => mySummarySchema.parse((body as { summary: unknown }).summary);

export const rewardStatusCopy: Record<MyReward["status"], Record<AppLocale, string>> = {
  information_required: { ko: "정보 입력 필요", en: "Information required" ,
  ...additionalLocales((translationLocale) => (localizedMessages.mb4717a21fc23[translationLocale]))
},
  ready: { ko: "준비 완료", en: "Ready" ,
  ...additionalLocales((translationLocale) => (localizedMessages.mf66ef64ed395[translationLocale]))
},
  shipping_preparing: { ko: "배송 준비 중", en: "Preparing shipment" ,
  ...additionalLocales((translationLocale) => (localizedMessages.m8386f0ad3416[translationLocale]))
},
  shipping_in_transit: { ko: "배송 중", en: "In transit" ,
  ...additionalLocales((translationLocale) => (localizedMessages.mf240ac8e77d3[translationLocale]))
},
  shipping_completed: { ko: "배송 완료", en: "Delivered" ,
  ...additionalLocales((translationLocale) => (localizedMessages.m8cb597538f65[translationLocale]))
},
  pickup_available: { ko: "수령 가능", en: "Ready for pickup" ,
  ...additionalLocales((translationLocale) => (localizedMessages.m9739df7093cb[translationLocale]))
},
  pickup_completed: { ko: "수령 완료", en: "Picked up" ,
  ...additionalLocales((translationLocale) => (localizedMessages.m5a526af5f90c[translationLocale]))
},
  digital_delivered: { ko: "지급 완료", en: "Delivered" ,
  ...additionalLocales((translationLocale) => (localizedMessages.m7b4b672e09ae[translationLocale]))
},
  not_selected: { ko: "미선정", en: "Not selected" ,
  ...additionalLocales((translationLocale) => (localizedMessages.m675176b0d466[translationLocale]))
},
};

function ProfileNav({ locale, label }: { locale: FanLocale; label: string }) {
  const t = copy[locale];
  return <nav aria-label={label}><FanAction variant="text" trailingIcon={<Bell/>} href={`/notifications?locale=${locale}`}>{locale === "ko" ? "알림" : t.notifications}</FanAction><FanAction variant="text" trailingIcon={<Settings/>} href={`/settings?locale=${locale}`}>{t.settings}</FanAction></nav>;
}

/** 모임 기능이 꺼진 옛 MY의 첫 로드 골격. */
function LegacyDashboardSkeleton({ locale }: { locale: FanLocale }) {
  const t = copy[locale];
  return <div className={styles.loadingDashboard} aria-busy="true">
    <FanSkeletonStatus locale={locale} label={t.loading} />
    <div className={styles.loadingProfile} aria-hidden="true"><span className={styles.loadingAvatar}/><div><span className={styles.loadingLine}/><span className={styles.loadingLine}/></div></div>
    <section><h2>{t.creators}</h2><div className={styles.loadingTiles} aria-hidden="true"><span/><span/></div></section>
    <section><h2>{t.reservedLive}</h2><div className={styles.loadingRow} aria-hidden="true"/></section>
    <section><h2>{t.collection}</h2><div className={styles.loadingTiles} aria-hidden="true"><span/><span/></div></section>
  </div>;
}

/** 첫 로드 골격. 실제 화면의 순서(프로필 → 패스포트·지갑 → 최애 → 바로가기)와 카드 크기를 그대로 쓰고, 값 자리만 비운다. */
function MyDashboardSkeleton({ locale }: { locale: FanLocale }) {
  const t = copy[locale];
  return <div className={styles.pencilMy} aria-busy="true">
    <FanSkeletonStatus locale={locale} label={t.loading} />
    <header className={styles.pencilProfile}>
      <AvatarPlaceholder size={56}/>
      <div className={styles.pencilProfileCopy}><FanSkeleton width={160} height={32} /></div>
      <ProfileNav locale={locale} label={t.settings} />
    </header>
    <div className={styles.homeRow}>
      <MyPassportCardSkeleton title={t.myPassport} />
      <MyWalletCardSkeleton locale={locale} />
    </div>
    <MyFavoritesSkeleton title={t.creators} />
    <MyShortcuts locale={locale} {...myShortcutGroups(locale, hrefWithLocale(locale))}/>
  </div>;
}

export function MyScreen({ locale }: { locale: FanLocale }) {
  const groupsEnabled=useGroupsRelease();
  const auth = usePrivy();
  const session = useByUsSession();
  const { ready, authenticated } = auth;
  const resource = useOwnedFanResource(`/api/me/summary?locale=${toContentLocale(locale)}&tierStages=1`, parseSummaryResponse, auth);
  const avatarResource = useAvatar();
  const state = resource.state;
  const t = copy[locale];

  const heading = <header className={styles.pageHeading}><FanHeading as="h1" variant="personal-page">{t.title}</FanHeading></header>;
  const skeleton = groupsEnabled ? <MyDashboardSkeleton locale={locale} /> : <>{heading}<LegacyDashboardSkeleton locale={locale} /></>;
  return <FanAppFrame locale={locale} className={fanUtilityCanvasClassName} mainId="my-content" currentPath="/my"><FanContentContainer as="main" className={`${styles.main} ${groupsEnabled?styles.groupsMain:""}`} id="my-content" tabIndex={-1}>
    {!ready || !session.ready ? skeleton
      : !authenticated ? <MyGuest locale={locale} />
      : <OwnerScopedDashboard
        key={auth.user?.id ?? "current-owner"}
        ownerKey={auth.user?.id ?? "current-owner"}
        summary={state.status === "ready" ? state.data : null}
        fallback={state.status === "error"
          ? <>{heading}<FanState kind="error" title={t.error} actions={<FanAction variant="neutral" fullWidth onClick={resource.retry} leadingIcon={<RotateCcw/>}>{t.retry}</FanAction>} /></>
          : skeleton}
        locale={locale}
        avatarResource={avatarResource}
        refreshSummary={resource.retry}
      />}
  </FanContentContainer></FanAppFrame>;
}

function OwnerScopedDashboard({ summary, fallback, locale, avatarResource, refreshSummary, ownerKey }: { ownerKey: string; summary: MySummary | null; fallback: ReactNode; locale: FanLocale; avatarResource: ReturnType<typeof useAvatar>; refreshSummary: () => void }) {
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  useEffect(() => {
    if (!summary) return;
    setSelectedSlug((current) => current && summary.creators.some((creator) => creator.celebrity.slug === current)
      ? current
      : summary.creators.find((creator) => creator.celebrity.slug === readSelectedBiasSlug(ownerKey))?.celebrity.slug ?? summary.creators[0]?.celebrity.slug ?? null);
  }, [summary, ownerKey]);

  return summary
    ? <Dashboard ownerKey={ownerKey} summary={summary} locale={locale} avatarResource={avatarResource} refreshSummary={refreshSummary} selectedSlug={selectedSlug} onSelectSlug={setSelectedSlug}/>
    : fallback;
}

function Dashboard({ summary, locale, avatarResource, refreshSummary, selectedSlug, onSelectSlug, ownerKey }: { ownerKey: string; summary: MySummary; locale: FanLocale; avatarResource: ReturnType<typeof useAvatar>; refreshSummary: () => void; selectedSlug: string | null; onSelectSlug: (slug: string) => void }) {
  const groupsEnabled=useGroupsRelease();
  const t = copy[locale];
  const w = walletCopy(locale);
  const nickname = summary.profile.nickname?.trim() || null;
  const communityStamps = useCommunityStamps();
  const stampCount = summary.collection.stampCount + boundFirstLikeCount(summary.creators) + (communityStamps.state.status === "ready" ? communityStamps.state.data.stamps.length : 0);
  const identity = nickname ? (locale === "ko" ? `${nickname}님` : nickname) : t.profileSummary;
  const receivedRewards = summary.rewards.items.filter((reward) => reward.result === "won");
  const reservedLives = prioritizeReservedLives(summary.live.upcoming);
  const passportCreators=summary.creators.filter(creator=>creator.passport);
  const visibleCreators=groupsEnabled?passportCreators:summary.creators;
  const selected = visibleCreators.find((creator) => creator.celebrity.slug === selectedSlug) ?? visibleCreators[0] ?? null;
  const visibleRecent = summary.collection.recent;
  const recentPreview = visibleRecent.slice(0, 3);
  const remainingRecent = visibleRecent.slice(3);
  const hasCollection = visibleRecent.length > 0 || stampCount > 0 || summary.collection.collectibleCount > 0;
  const hasLive = reservedLives.length > 0 || summary.live.history.length > 0;
  const hasVisibleCollectible = visibleRecent.some((item) => item.kind === "collectible");
  const [recentOpen, setRecentOpen] = useState(false);
  const collectionFrame = useRef<number | null>(null);
  const openRecent = useCallback(() => {
    setRecentOpen(true);
    if (collectionFrame.current !== null) cancelAnimationFrame(collectionFrame.current);
    collectionFrame.current = requestAnimationFrame(() => {
      const collection = document.getElementById("my-collection");
      collection?.scrollIntoView({ block: "start" });
      collection?.focus({ preventScroll: true });
      collectionFrame.current = null;
    });
  }, [setRecentOpen]);
  useEffect(() => {
    const followFragment = () => { if (window.location.hash === "#my-collection") openRecent(); };
    followFragment();
    window.addEventListener("hashchange", followFragment);
    return () => {
      window.removeEventListener("hashchange", followFragment);
      if (collectionFrame.current !== null) cancelAnimationFrame(collectionFrame.current);
    };
  }, [openRecent]);

  if (groupsEnabled) {
    const labels = { title: t.myPassport, detail: myHomeText(locale, "viewDetails"), noCreators: t.noCreators, findCreator: t.findCreator, loadError: w.error, retry: w.retry, creators: t.creators };
    const stamps = communityStamps.state.status === "ready" ? communityStamps.state.data.stamps : [];
    return <DukjilProvider locale={locale}><div className={styles.pencilMy}>
      <header className={styles.pencilProfile}>
        <Link href={`/settings?locale=${locale}&section=profile` as Route} aria-label={t.avatarSettings}>{avatarResource.state.status === "ready" ? <Avatar avatar={avatarResource.state.avatar} imageUrl={avatarResource.state.imageUrl} label={t.avatarSettings} size={56}/> : <AvatarPlaceholder size={56}/>}</Link>
        <div className={`${styles.pencilProfileCopy} ${styles.pencilName}`}><h1>{identity}</h1>{selected?.passport ? <FanTag tone="fan">{passportTierName(locale, selected.passport)}</FanTag> : null}</div>
        <ProfileNav locale={locale} label={t.settings} />
      </header>
      <MyRaffleNotice locale={locale} ownerKey={ownerKey} resultIds={summary.rewards.items.map(reward => reward.rewardResultId)}/>
      <div className={styles.homeRow}>
        <MyPassportCard creators={visibleCreators} selectedSlug={selectedSlug} onSelect={onSelectSlug} communityStamps={stamps} stampsError={communityStamps.state.status === "error"} retryStamps={communityStamps.retry} locale={locale} labels={labels}/>
        <div className={styles.walletColumn}><MyWalletCard locale={locale}/><PointsUseSoon locale={locale}/></div>
      </div>
      <MyFavorites creators={passportCreators} locale={locale} labels={{ title: t.creators, find: t.findCreator, empty: t.noCreators }}/>
      <MyShortcuts locale={locale} {...myShortcutGroups(locale, hrefWithLocale(locale))}/>
    </div></DukjilProvider>;
  }

  return <div className={styles.dashboard}>
    <header className={styles.profileHeader}>
      <Link className={styles.avatarLink} href={`/settings?locale=${locale}&section=profile` as Route} aria-label={t.avatarSettings}>
        {avatarResource.state.status === "ready"
          ? <Avatar avatar={avatarResource.state.avatar} imageUrl={avatarResource.state.imageUrl} label={t.avatarSettings} size={64}/>
          : <AvatarPlaceholder size={64}/>}
        <span className={styles.avatarEdit} aria-hidden="true"><Pencil/></span>
      </Link>
      <div className={styles.profileCopy}>
        <h1>{identity}</h1></div>
      <div className={styles.profileActions}>
        <Link className={styles.notificationLink} href={`/notifications?locale=${locale}` as Route}><Bell aria-hidden="true"/><span>{t.notifications}</span><strong>{summary.unreadNotificationCount}</strong></Link>
        <Link className={styles.notificationLink} href={`/my/inquiries?locale=${locale}` as Route}><MessageSquare aria-hidden="true"/><span>{locale === "ko" ? "문의 내역" : translate(locale, localizedMessages.mbf5ca7f787a3, "My inquiries")}</span></Link>
        <Link className={styles.notificationLink} href={`/settings?locale=${locale}` as Route}><Settings aria-hidden="true"/><span>{t.settings}</span></Link>
      </div>
    </header>

    {summary.rewards.items.length > 0 ? <RaffleResultsNotice locale={locale} /> : null}

    {!groupsEnabled&&<nav className={`${styles.destinations} ${styles.primaryDestinations}`} aria-label={t.destinations}>
      <Link href={`/passports?locale=${locale}` as Route}>
        <span className={styles.destinationIcon} data-kind="passport" aria-hidden="true"><BookOpen /></span>
        <span><strong>{t.myPassport}</strong><small>{t.passportSummary(summary.collection.passportCount)}</small></span>
        <ArrowRight aria-hidden="true" />
      </Link>
      <Link href={(reservedLives.length ? "#my-reserved-live" : `/live?locale=${locale}`) as Route}>
        <span className={styles.destinationIcon} data-kind="live" aria-hidden="true"><CalendarDays /></span>
        <span><strong>{t.reservedLive}</strong><small>{reservedLives.length ? t.reservationCount(reservedLives.length) : t.noReservedLive}</small></span>
        <ArrowRight aria-hidden="true" />
      </Link>
      <Link href={`/my/raffles?locale=${locale}` as Route}>
        <span className={styles.destinationIcon} data-kind="benefit" aria-hidden="true"><Ticket /></span>
        <span><strong>{raffleDiscoveryCopy[locale].myTitle}</strong><small>{raffleDiscoveryCopy[locale].myDescription}</small></span>
        <ArrowRight aria-hidden="true" />
      </Link>
    </nav>}

    <FanSurface appearance="plain" className={`${styles.section} ${styles.favoritesSection}`} id="my-creators">
      <SectionTitle title={<>{t.creators} <span className={styles.sectionCount}>{visibleCreators.length}</span></>} href={`/celebrities?locale=${locale}`} action={t.findCreator}/>
      {!groupsEnabled&&visibleCreators.length ? <div className={styles.favoriteSelector} role="group" id="my-favorite-selector" aria-label={t.creators}>{visibleCreators.map((creator) =>
        <button type="button" aria-pressed={selected?.celebrity.slug === creator.celebrity.slug} onClick={() => onSelectSlug(creator.celebrity.slug)} key={creator.celebrity.slug}>
          <span className={styles.favoritePortrait}><CreatorImage slug={creator.celebrity.slug} src={creator.celebrity.image} photos={creator.celebrity.photos} position={creator.celebrity.imagePosition} alt="" width={40} height={40} sizes="40px" presentation="portrait" framed/>{selected?.celebrity.slug === creator.celebrity.slug ? <Check className={styles.selectedCheck} aria-hidden="true"/> : null}</span><strong>{creator.celebrity.name}</strong>
        </button>)}</div>
        : !groupsEnabled?<Empty text={t.noCreators} href={`/celebrities?locale=${locale}`} action={t.findCreator}/>:null}
      {selected ? <SelectedFavoritePanels key={selected.celebrity.slug} creator={selected} locale={locale}/> : null}
    </FanSurface>

    <section className={styles.secondaryActions} aria-labelledby="my-secondary-actions-title">
      <h2 id="my-secondary-actions-title">{personalCopy[locale].title}</h2>
      <nav className={`${styles.destinations} ${styles.secondaryDestinations}`} aria-label={personalCopy[locale].title}>
        <Link href={`/my/activity?locale=${locale}` as Route}>
          <span className={styles.destinationIcon} data-kind="activity" aria-hidden="true"><History /></span>
          <span><strong>{personalCopy[locale].title}</strong><small>{personalCopy[locale].applications} · {personalCopy[locale].rewards} · {personalCopy[locale].collection}</small></span>
          <ArrowRight aria-hidden="true" />
        </Link>
        <Link href={`/my/requests?locale=${locale}` as Route}>
          <span className={styles.destinationIcon} data-kind="requests" aria-hidden="true"><ListChecks /></span>
          <span><strong>{participationCopy(locale).requests}</strong><small>{participationCopy(locale).suggest} · {participationCopy(locale).fanpage}</small></span>
          <ArrowRight aria-hidden="true" />
        </Link>
      </nav>
    </section>

    <CommunityStampCollection locale={locale} resource={communityStamps} creatorNames={Object.fromEntries((summary?.creators ?? []).map((creator) => [creator.celebrity.slug, creator.celebrity.name]))}/>

    {hasLive || hasCollection ? <div className={styles.lowerGrid} data-single-section={!hasLive || !hasCollection}>
      {hasLive ? <ReservedLiveSection events={reservedLives} history={summary.live.history} locale={locale} onStartReached={refreshSummary}/> : null}
      {hasCollection ? <FanSurface appearance="plain" className={styles.section} id="my-collection" tabIndex={-1}>
        <SectionTitle title={t.collection} href={`/my/activity?kind=collection&locale=${locale}`} action={t.allCollection}/>
        <div className={styles.collectionTotals}>
          <CollectionTotal icon={<Sparkles/>} value={stampCount} label={t.stamps} href={`/passports?locale=${locale}#collection`} kind="stamp"/>
          <CollectionTotal icon={<FanMotionIcon name="gift" size={16}/>} value={summary.collection.collectibleCount} label={t.collectibles} href={hasVisibleCollectible ? "#my-collection" : undefined} onClick={hasVisibleCollectible ? openRecent : undefined} kind="collectible"/>
        </div>
        <RecentActivityRows items={recentPreview} creators={summary.creators} locale={locale}/>
        {remainingRecent.length > 0 ? <details className={styles.recentDisclosure} open={recentOpen} onToggle={event => setRecentOpen(event.currentTarget.open)}>
          <summary><span>{recentOpen ? (locale === "ko" ? "접기" : translate(locale, localizedMessages.ma9d92b36cfae, "Show less")) : (locale === "ko" ? `${remainingRecent.length}개 더 보기` : translate(locale, localizedMessages.m6e5a2ccb1304, "Show {0} more", [remainingRecent.length]))}</span>{recentOpen ? <Minus aria-hidden="true"/> : <Plus aria-hidden="true"/>}</summary>
          <RecentActivityRows items={remainingRecent} creators={summary.creators} locale={locale}/>
        </details> : null}
      </FanSurface> : null}
    </div> : null}

    {receivedRewards.length > 0 ? <FanSurface className={styles.section}>
      <SectionTitle title={t.rewards} href={`/my/activity?kind=rewards&locale=${locale}`} action={personalCopy[locale].rewards}/>
      <div className={styles.rows}>{receivedRewards.slice(0, 4).map((reward) => {
        const recipientHref = reward.recipientRequired && reward.winnerId ? `/my/rewards/${reward.winnerId}/recipient` : null;
        const status = recipientHref ? (locale === "ko" ? "수령 정보 입력" : translate(locale, localizedMessages.mbd998889a6d6, "Enter recipient details")) : rewardStatusCopy[reward.status][locale];
        return <Link href={withLocalePath(recipientHref ?? reward.benefitHref, locale) as Route} key={reward.rewardResultId}><span className={styles.activityMark} data-kind="collectible" aria-hidden="true"><FanMotionIcon name="gift" size={20}/></span><div><strong>{reward.title}</strong><span>{status}</span></div><ArrowRight/></Link>;
      })}</div>
    </FanSurface> : null}
  </div>;
}

function SelectedFavoritePanels({ creator, locale }: { creator: MyCreator; locale: FanLocale }) {
  const t = copy[locale];
  const ko = locale === "ko";
  const [now, setNow] = useState(() => Date.now());
  const slug = encodeURIComponent(creator.celebrity.slug);
  const parseRaffles = useCallback((body: unknown) => raffleListSchema.parse(body).raffles, []);
  const raffles = useFanpageResource(creator.celebrity.isPublic ? `/api/celebrities/${slug}/raffles?locale=${toContentLocale(locale)}` : null, parseRaffles);
  const raffleState = raffles.state;
  const retryRaffles = raffles.retry;
  const openRaffles = raffleState.status === "ready" ? selectOpenRaffles(raffleState.data, new Date(now)) : [];
  const raffleAllHref = creatorRafflesHref(creator.celebrity.slug, locale);
  const activityHref = `${creatorHomeHref(slug)}?tab=certifications&locale=${locale}#celebrity-content` as Route;
  useEffect(() => {
    if (raffleState.status !== "ready") return;
    const scheduledNow = Date.now();
    const refreshVisible = () => { if (document.visibilityState === "visible") { setNow(Date.now()); retryRaffles(); } };
    const timer = scheduleRaffleBoundary(raffleState.data, scheduledNow, () => setNow(Date.now()), retryRaffles);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => { if (timer !== undefined) window.clearTimeout(timer); document.removeEventListener("visibilitychange", refreshVisible); };
  }, [now, raffleState, retryRaffles]);
  return <FanSurface className={styles.selectedDetails} aria-label={locale === "ko" ? `${creator.celebrity.name} 팬 활동` : translate(locale, localizedMessages.m1e2889748a87, "{0} fan activity", [creator.celebrity.name])}>
    <div className={styles.corePanels}>
      <section className={styles.growthPanel}>
        <div className={styles.panelContent}>
          <SectionTitle title={t.fanTier(creator.celebrity.name)} href={creator.passport ? `/passports/${creator.passport.id}?locale=${locale}` : undefined} action={creator.passport ? t.myPassport : undefined}/>
          {creator.passport ? <FanGrade creator={creator as PassportCreator} locale={locale}/> : <p className={styles.panelState}>{locale === "ko" ? `${creator.celebrity.name} 팬 인증을 시작하고 첫 팬등급을 만들어보세요.` : translate(locale, localizedMessages.m343c50cb9a59, "Start {0} fan verification to earn your first tier.", [creator.celebrity.name])}</p>}
        </div>
        {creator.celebrity.isPublic ? <div className={styles.panelAction}><Link className={styles.fanActivityLink} href={activityHref}>{creator.passport ? (locale === "ko" ? "참여할 팬 활동 보기" : translate(locale, localizedMessages.m51c0c8f56b17, "Explore fan activities")) : t.startPassport}<ArrowRight aria-hidden="true"/></Link></div> : null}
      </section>
      <section className={styles.activityPanel}>
        <div className={styles.panelContent}>
          <SectionTitle title={locale === "ko" ? `${creator.celebrity.name} 이벤트` : translate(locale, localizedMessages.m11202455f80b, "{0} events", [creator.celebrity.name])} href={`/my/raffles?locale=${locale}`} action={locale === "ko" ? "내 응모 내역" : translate(locale, localizedMessages.m59a59a47cffd, "My entries")}/>
          {!creator.celebrity.isPublic ? <p className={styles.panelState}>{locale === "ko" ? "현재 진행 중인 이벤트가 없어요." : translate(locale, localizedMessages.m0fca25890c94, "No events are open right now.")}</p>
            : raffleState.status === "loading" ? <p className={styles.panelState} role="status">{locale === "ko" ? "이벤트를 불러오는 중이에요." : translate(locale, localizedMessages.mf4c9eb491dff, "Loading events.")}</p>
            : raffleState.status === "error" ? <div className={styles.panelState} role="alert"><p>{locale === "ko" ? "이벤트를 불러오지 못했어요." : translate(locale, localizedMessages.mdd8573a9baf2, "We couldn’t load events.")}</p><FanAction variant="text" onClick={retryRaffles}>{t.retry}</FanAction></div>
            : openRaffles.length > 0 ? <div className={styles.eventSummary}>
              <div className={styles.eventTitle}><span className={styles.eventIcon}><Gift aria-hidden="true"/></span><h3>{ko ? <>응모할 수 있는 선물 <em>{openRaffles.length}종</em></> : locale === "en" ? <>{openRaffles.length} {openRaffles.length === 1 ? "gift" : "gifts"} to enter for</> : translate(locale, localizedMessages.mb3e721bb6234, "{0} gifts to enter for", [openRaffles.length])}</h3></div>
              <p>{locale === "ko" ? "마음에 드는 선물을 고르고, 모은 응모권으로 참여해 보세요." : translate(locale, localizedMessages.m58b6515d67d0, "Choose a gift and enter with your tickets.")}</p>
              <p className={styles.eventDeadline}>{locale === "ko" ? "가장 가까운 마감 · " : translate(locale, localizedMessages.m7d4e6ed6ba76, "Next deadline · ")}<time dateTime={openRaffles[0].entryClosesAt!}>{formatClosing(openRaffles[0].entryClosesAt!, locale)}</time></p>
            </div> : <p className={styles.panelState}>{locale === "ko" ? "현재 진행 중인 이벤트가 없어요." : translate(locale, localizedMessages.m0fca25890c94, "No events are open right now.")}</p>}
          <div className={styles.eventWallet}><span><Ticket aria-hidden="true"/>{locale === "ko" ? "보유 응모권" : translate(locale, localizedMessages.ma88be67e1498, "Available tickets")}</span><strong>{creator.ticketBalance}{ko ? "장" : ""}</strong></div>
          {creator.celebrity.isPublic ? <Link className={styles.ticketHistoryLink} href={`/c/${creator.celebrity.slug}/tickets?locale=${locale}` as Route}>{FAN_TICKET_CREATOR_SLUGS.has(creator.celebrity.slug) ? (locale === "ko" ? "응모권 모으기 · 내역 보기" : translate(locale, localizedMessages.md2234a576ef5, "Collect tickets · View history")) : (locale === "ko" ? "응모권 내역 보기" : translate(locale, localizedMessages.m88bda75c40da, "View ticket history"))}<ArrowRight aria-hidden="true"/></Link> : null}
        </div>
        {creator.celebrity.isPublic ? <div className={styles.panelAction}><FanAction fullWidth href={raffleAllHref} trailingIcon={<ArrowRight/>}>{locale === "ko" ? "이벤트 보러 가기" : translate(locale, localizedMessages.m65e43e1ae2a9, "Explore events")}</FanAction></div> : null}
      </section>
    </div>
  </FanSurface>;
}

export function scheduleRaffleBoundary(
  raffles: Parameters<typeof nextRaffleBoundary>[0],
  now: number,
  onBoundary: () => void,
  onOpen: () => void,
) {
  const nextBoundary = nextRaffleBoundary(raffles, now);
  if (!nextBoundary) return undefined;
  return window.setTimeout(() => { onBoundary(); if (nextBoundary.opens) onOpen(); }, Math.min(nextBoundary.at - now + 1, 2_147_483_647));
}

function FanGrade({ creator, locale }: { creator: PassportCreator; locale: FanLocale }) {
  const t = copy[locale];
  const stage = creator.passport.stageProgress;
  const currentLabel = stage ? fanStageLabel(locale, stage.current) : levelLabel(locale, creator.passport.tier);
  return <div className={styles.fanGrade}>
    <div className={styles.gradeIdentity}><FanTierBadge tier={creator.passport.tier} stageKey={stage?.current.key} locale={locale} size={88}/><div><strong>{currentLabel}</strong><p>{t.tierHelp}</p></div></div>
  </div>;
}

function formatClosing(value: string, locale: FanLocale) {
  return `${new Intl.DateTimeFormat(locale, { calendar: "gregory", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul" }).format(new Date(value))} ${locale === "ko" ? "마감" : translate(locale, localizedMessages.m2d53c23126e6, "KST")}`;
}

function RecentActivityRows({ items, creators, locale }: { items: MySummary["collection"]["recent"]; creators: MySummary["creators"]; locale: FanLocale }) {
  const formatDate = (value: string) => new Intl.DateTimeFormat(locale, { calendar: "gregory", dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(value));
  return <div className={`${styles.rows} ${styles.collectionRows}`}>{groupRecentCollection(items).map((group) => {
    const { item } = group;
    const creator = creators.find(({ passport }) => passport && item.href === `/passports/${passport.id}`)?.celebrity;
    return <Link href={`${item.href}?locale=${locale}` as Route} key={`${item.kind}-${item.id}`}>
      {creator ? <CreatorImage slug={creator.slug} src={creator.image} photos={creator.photos} position={creator.imagePosition} alt="" width={40} height={40} sizes="40px" presentation="portrait" framed/>
        : <span className={styles.activityMark} data-kind={item.kind} aria-hidden="true">{item.kind === "stamp" ? <Sparkles/> : <FanMotionIcon name="gift" size={20}/>}</span>}
      <div><strong>{collectionGroupTitle(group, locale)}</strong><span>{formatDate(item.occurredAt)}</span></div><ArrowRight aria-hidden="true"/>
    </Link>;
  })}</div>;
}

function CollectionTotal({ icon, value, label, href, kind, onClick }: { icon: ReactNode; value: number; label: string; href?: string; kind: "stamp" | "collectible"; onClick?: () => void }) {
  const content = <><span aria-hidden="true">{icon}</span><span>{label} {value}</span></>;
  return href ? <Link className={styles.collectionTotal} data-kind={kind} href={href as Route} onClick={onClick}>{content}</Link> : <span className={styles.collectionTotal} data-kind={kind}>{content}</span>;
}

function SectionTitle({ title, help, href, action }: { title: ReactNode; help?: string; href?: string; action?: string }) {
  return <FanSectionHeader variant="personal" title={title} description={help} action={href && action ? { href, label: action } : undefined} />;
}

function Empty({ text, href, action }: { text: string; href: string; action: string }) {
  return <div className={styles.empty}><span>{text}</span><Link href={href as Route}>{action}<ArrowRight/></Link></div>;
}

export function passportProgressLabel(passport: NonNullable<MySummary["creators"][number]["passport"]>, locale: FanLocale) {
  return levelLabel(locale, passport.tier);
}

function ReservedLiveSection({events,history,locale,onStartReached}:{events:MySummary["live"]["upcoming"];history:MySummary["live"]["history"];locale:FanLocale;onStartReached:()=>void}) {
 const t=copy[locale];
 const [otherOpen,setOtherOpen]=useState(false);
 const formatDate=(value:string)=>new Intl.DateTimeFormat(locale,{ calendar: "gregory",dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Seoul"}).format(new Date(value));
 const row=(event:MySummary["live"]["upcoming"][number],active=true)=><Link href={`/live/${event.slug}?locale=${locale}` as Route} key={event.id}><time className={styles.liveDate} dateTime={event.startsAt}><span>{new Intl.DateTimeFormat(locale, { calendar: "gregory", month:"short", timeZone:"Asia/Seoul" }).format(new Date(event.startsAt))}</span><b>{new Intl.DateTimeFormat("en-US", { calendar: "gregory", day:"numeric", timeZone:"Asia/Seoul" }).format(new Date(event.startsAt))}</b></time><div><strong>{event.title}</strong><span>{formatDate(event.startsAt)} KST</span><MyLiveCountdown event={event} locale={locale} active={active} onStartReached={onStartReached}/></div><ArrowRight/></Link>;
 return <FanSurface appearance="plain" className={styles.section} id="my-reserved-live" tabIndex={-1} aria-label={t.live}>
  <SectionTitle title={t.live} href={`/live?locale=${locale}`} action={t.allLive}/>
  {events.length?<div className={`${styles.rows} ${styles.reservedRows}`}>{row(events[0])}</div>:<Empty text={t.noLive} href={`/live?locale=${locale}`} action={t.browseLive}/>}
  {events.length>1?<details className={styles.history} open={otherOpen} onToggle={event=>setOtherOpen(event.currentTarget.open)}><summary>{locale === "ko" ? "다른 예약 LIVE" : translate(locale, localizedMessages.m166efc88e4ff, "Other reserved LIVE")} ({events.length-1})</summary><div className={`${styles.rows} ${styles.reservedRows}`}>{events.slice(1).map(event=>row(event,otherOpen))}</div></details>:null}
  {history.length>0?<details className={styles.history}><summary>{t.history} ({history.length})</summary>{history.map(event=><Link href={`/live/${event.slug}?locale=${locale}` as Route} key={event.id}>{event.title}<span>{formatDate(event.startsAt)}</span></Link>)}</details>:null}
 </FanSurface>;
}

/** 바로가기 묶음. 자주 쓰는 넷은 격자, 드물게 쓰는 것은 목록. 로그인·비로그인이 같은 목록을 쓰고 주소만 다르다. */
function myShortcutGroups(locale: FanLocale, hrefFor: (path: string) => string): { frequent: MyShortcut[]; rest: MyShortcut[] } {
  const t = copy[locale];
  const ko = locale === "ko";
  return {
    frequent: [
      { key: "activity", href: hrefFor("/my/activity"), label: ko ? "활동 내역" : personalCopy[locale].title, Icon: History },
      { key: "raffles", href: hrefFor("/my/raffles"), label: ko ? "내 응모 내역" : personalCopy[locale].raffles, Icon: Ticket },
      { key: "rewards", href: hrefFor("/my/activity?kind=rewards"), label: t.rewards, Icon: Gift },
      { key: "live", href: hrefFor("/live/calendar"), label: ko ? "예약한 LIVE" : t.reservedLive, Icon: CalendarDays },
    ],
    rest: [
      { key: "requests", href: hrefFor("/my/requests"), label: personalCopy[locale].applications, Icon: ListChecks },
      { key: "friends", href: hrefFor("/my/friends"), label: ko ? "친구와 메시지" : socialCopy(locale).title, Icon: MessagesSquare },
      { key: "reports", href: hrefFor("/my/groups/reports"), label: groupOwnReportsCopy(locale)[0], Icon: MessageSquare },
      { key: "inquiries", href: hrefFor("/my/inquiries"), label: supportCopy[locale].title, Icon: MessageSquare },
    ],
  };
}
const hrefWithLocale = (locale: FanLocale) => (path: string) => `${path}${path.includes("?") ? "&" : "?"}locale=${locale}`;

/** 비로그인 MY. 로그인 화면과 같은 구역·순서(프로필 → 패스포트 → 지갑 → 최애 → 바로가기)를 두고, 내 값은 잠근 칸으로, 공개 구성(미션북 9칸)은 실제로 보여 준다. */
function MyGuest({ locale }: { locale: FanLocale }) {
  const t = copy[locale];
  const ko = locale === "ko";
  const here = `/my?locale=${locale}`;
  const loginTo = (path: string) => fanLoginHref(locale, hrefWithLocale(locale)(path));
  return <div className={styles.pencilMy}>
    <header className={`${styles.pencilProfile} ${styles.guestProfile}`}>
      <span className={styles.guestAvatar} aria-hidden="true"><AvatarPlaceholder size={56}/></span>
      <div className={styles.pencilProfileCopy}><h1>{t.profileSummary}</h1></div>
      <ProfileNav locale={locale} label={t.settings} />
    </header>
    <div className={styles.homeRow}>
      <MyGuestPassportCard locale={locale} labels={{ title: t.myPassport, detail: myHomeText(locale, "viewDetails") }}/>
      <div className={styles.walletColumn}><MyGuestWalletCard locale={locale} returnTo={here}/><PointsUseSoon locale={locale}/></div>
    </div>
    <MyGuestFavorites locale={locale} labels={{ title: t.creators, find: t.findCreator, empty: t.noCreators }}/>
    <MyShortcuts locale={locale} {...myShortcutGroups(locale, loginTo)}/>
  </div>;
}
