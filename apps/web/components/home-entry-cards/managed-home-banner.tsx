"use client";

import type { AppLocale } from "@/i18n/locales";
import { growthSignupCopy } from "@/i18n/growth-signup";
import { messages as localizedMessages } from "@/i18n/catalogs/components__home-entry-cards__managed-home-banner";
import { translate } from "@/i18n/messages";
import { getImageProps } from "next/image";
import { preload } from "react-dom";
import Link from "../fan-ui/hover-prefetch-link";
import type { Route } from "next";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { bannerCategoryLabel } from "@/features/home/domain/banner-category";
import { isChemiPromoHref, isGuideBanner, localizedBannerHref, type HomeBanner } from "../../features/home/domain/home-banner";
import { FIRST_STEPS_BANNER_ID } from "../../features/home/domain/first-steps-home-banner";
import { PD_SHORTS_BANNER_ID } from "../../features/home/domain/pd-shorts-banner";
import { SIGNUP_RAFFLE_BANNER_ID } from "../../features/home/domain/signup-raffle-home-banner";
import { MISSIONBOOK_BANNER_ID } from "../../features/home/domain/missionbook-home-banner";
import { MissionbookLikeCount } from "../../features/home/ui/missionbook-like-count";
import { isAdminEventBanner } from "../../features/home/domain/event-banner-priority";
import { EventDayEyebrow } from "../../features/home/ui/event-day-eyebrow";
import motionStyles from "../fan-ui/event-blink.module.css";
import { liveEventLabel } from "../../features/home/domain/event-day";
import { FanText } from "../fan-ui/fan-text";
import { HomeHeroBanner } from "./home-hero-banner";
import { AdRewardBadge, useAdReward } from "@/features/home/ui/ad-reward";
import { SceneVideo } from "@/features/chemi/ui/scene-video";
import { bypassImageOptimization, homeHeroCampaignSizes, homeHeroSizes } from "../fan-ui/public-image-policy";
import styles from "./managed-home-banner.module.css";
import carouselStyles from "../guest-home.module.css";

const missionbookSizes = "(min-width: 1440px) 1360px, (min-width: 1024px) calc(100vw - 80px), (min-width: 768px) calc(100vw - 64px), calc(100vw - 32px)";

const entrantLabels: Record<AppLocale, string> = {
  ko: "현재 응모자 수 #명", en: "Current entrants: #", ja: "現在の応募者数 #人",
  "zh-Hans": "当前报名人数 #人", "zh-Hant": "目前報名人數 #人", es: "Participantes actuales: #",
  id: "Jumlah peserta saat ini: #", vi: "Số người hiện đã đăng ký: #", th: "ผู้สมัครขณะนี้ # คน",
  pt: "Participantes atuais: #", fr: "Participants à ce jour : #", ru: "Сейчас участников: #",
  mn: "Одоогийн оролцогчдын тоо: #",
};

function BannerArtwork({ banner, priority, creatorWelcome, campaign }: { banner: HomeBanner; priority: boolean; creatorWelcome: boolean; campaign: boolean }) {
  const [failed, setFailed] = useState(false);
  const mobile = banner.mobileImage ?? banner.desktopImage;
  const propsFor = (asset: typeof mobile) => getImageProps({
    src: asset.url, alt: banner.alt, unoptimized: bypassImageOptimization(asset.url), width: asset.width, height: asset.height,
    // PERF-r5: sized to the 4차 hero slot (952 at 1440, beside the aside from 1024), the campaign art to its 46% column.
    sizes: [PD_SHORTS_BANNER_ID, MISSIONBOOK_BANNER_ID, SIGNUP_RAFFLE_BANNER_ID].includes(banner.id) ? missionbookSizes : campaign ? homeHeroCampaignSizes() : homeHeroSizes(),
  }).props;
  const desktopProps = propsFor(banner.desktopImage);
  const mobileProps = propsFor(mobile);
  const desktopMedia = creatorWelcome ? "(min-width: 768px) and (max-width: 1023px), (min-width: 1200px)" : "(min-width: 768px)";
  if (priority) {
    // PERF-r5: the first slide's image is requested from the head, before the stylesheets and scripts. One asset (no mobile original) needs one
    // hint, its sizes covering every width; two assets get one hint per <picture> source, the mobile media the exact complement of the source's.
    preload(desktopProps.src, { as: "image", fetchPriority: "high", imageSrcSet: desktopProps.srcSet, imageSizes: desktopProps.sizes, ...(banner.mobileImage ? { media: desktopMedia } : {}) });
    if (banner.mobileImage) preload(mobileProps.src, { as: "image", fetchPriority: "high", imageSrcSet: mobileProps.srcSet, imageSizes: mobileProps.sizes, media: creatorWelcome ? "(max-width: 767px), (min-width: 1024px) and (max-width: 1199px)" : "(max-width: 767px)" });
  }
  if (failed) return <div className={styles.unavailable} data-banner-image-unavailable />;
  const { video } = banner;
  return <>
    <picture className={styles.artwork} data-mobile-fallback={!banner.mobileImage}>
      <source media={desktopMedia} srcSet={desktopProps.srcSet ?? desktopProps.src} sizes={desktopProps.sizes} />
      {/* getImageProps supplies Next's optimized image sources for the responsive picture. */}
      <img {...mobileProps} alt={banner.alt} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} onError={() => setFailed(true)} />
    </picture>
    {/* The picture stays underneath as the poster; each loop loads only at the width that shows it (hidden layers never intersect). */}
    {video && <span className={styles.motion} data-banner-video={video.mobile ? "desktop" : "all"}><SceneVideo src={video.desktop} /></span>}
    {video?.mobile && <span className={styles.motion} data-banner-video="mobile"><SceneVideo src={video.mobile} /></span>}
  </>;
}

export function ManagedHomeBanner({ banner, locale, priority = false, liveEvent = false }: { banner: HomeBanner; locale: AppLocale; priority?: boolean; liveEvent?: boolean }) {
  const gggiCampaign = banner.id === "8bf2f180-cb32-4f00-93e2-e84b570ad450";
  const guideArt = isGuideBanner(banner);
  const chemi = guideArt && isChemiPromoHref(banner.href);
  const raffle = banner.id === SIGNUP_RAFFLE_BANNER_ID;
  const [beforeCount, afterCount] = entrantLabels[locale].split("#");
  const missionbook = banner.id === MISSIONBOOK_BANNER_ID;
  const creatorWelcome = banner.kind === "announcement" && banner.celebrityId !== null && banner.desktopImage.width === banner.desktopImage.height;
  const reward = useAdReward(banner);
  const artwork = <BannerArtwork key={`${banner.desktopImage.id}:${banner.mobileImage?.id ?? ""}`} banner={banner} priority={priority} creatorWelcome={creatorWelcome} campaign={gggiCampaign} />;
  return <div className={styles.root} data-managed-home-banner={banner.id} data-signup-raffle={raffle || undefined} data-creator-welcome={creatorWelcome} data-guide-art={guideArt && !chemi || undefined} data-chemi-art={chemi || undefined} data-missionbook={missionbook || undefined} data-first-steps={banner.id === FIRST_STEPS_BANNER_ID || undefined} data-gggi-campaign={gggiCampaign || undefined}>
    {banner.entrantCount != null && (raffle || banner.href.split("?")[0] === "/s/raffle") && <FanText role="meta" className={styles.entrantBadge}>{beforeCount}<FanText role="label" as="strong">{banner.entrantCount.toLocaleString(locale)}</FanText>{afterCount}</FanText>}
    <HomeHeroBanner imageBadge={liveEvent ? <span className={`${carouselStyles.carouselPill} ${styles.liveEvent} ${motionStyles.eventBlink}`} data-motion="home-live-event">{liveEventLabel(locale)}</span> : undefined} kind={banner.id === PD_SHORTS_BANNER_ID ? "photo" : chemi ? "chemi" : raffle ? "raffle" : missionbook ? "missionbook" : ["/s/x", "/follow"].includes(banner.href.split("?")[0]) ? "mission" : gggiCampaign ? "campaign" : creatorWelcome ? "welcome" : guideArt ? "art" : "live"} image={creatorWelcome ? artwork : null} fullImage={creatorWelcome ? undefined : artwork}
      eyebrow={chemi ? (locale === "ko" ? "케미 베타" : "Chemi beta") : isAdminEventBanner(banner) ? <EventDayEyebrow locale={locale} /> : banner.category && ['event','group','fanpage','ad'].includes(banner.category) || guideArt ? bannerCategoryLabel(banner.category ?? "guide", locale) : gggiCampaign ? "GGGI × CHANGHA" : banner.kind === "regular_live" ? (locale === "ko" ? "정기 방송" : translate(locale, localizedMessages.me0d4dde550fa, "Regular LIVE")) : (locale === "ko" ? "kyaa 소식" : translate(locale, localizedMessages.m11331552a52b, "kyaa news"))}
      title={banner.title} description={missionbook ? <MissionbookLikeCount locale={locale} tone="banner" /> : banner.description}
      eyebrowBadge={<AdRewardBadge mark={reward.mark} locale={locale} />} action={<Link href={localizedBannerHref(banner.href, locale) as Route} onClick={reward.claim}><span>{banner.href.split(/[?#]/)[0] === "/s/raffle" ? growthSignupCopy[locale].enter : banner.ctaLabel}</span><ArrowRight aria-hidden="true" /></Link>} />
  </div>;
}
