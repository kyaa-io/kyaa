"use client";

import type { AppLocale } from "@/i18n/locales";
import { messages as localizedMessages } from "@/i18n/catalogs/components__home-entry-cards__managed-home-banner";
import { translate } from "@/i18n/messages";
import { getImageProps } from "next/image";
import { preload } from "react-dom";
import Link from "../fan-ui/hover-prefetch-link";
import type { Route } from "next";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { bannerCategoryLabel } from "@/features/home/domain/banner-category";
import { isGuideBanner, localizedBannerHref, type HomeBanner } from "../../features/home/domain/home-banner";
import { FIRST_STEPS_BANNER_ID } from "../../features/home/domain/first-steps-home-banner";
import { HomeHeroBanner } from "./home-hero-banner";
import { bypassImageOptimization, homeHeroCampaignSizes, homeHeroSizes } from "../fan-ui/public-image-policy";
import styles from "./managed-home-banner.module.css";

function BannerArtwork({ banner, priority, creatorWelcome, campaign }: { banner: HomeBanner; priority: boolean; creatorWelcome: boolean; campaign: boolean }) {
  const [failed, setFailed] = useState(false);
  const mobile = banner.mobileImage ?? banner.desktopImage;
  const propsFor = (asset: typeof mobile) => getImageProps({
    src: asset.url, alt: banner.alt, unoptimized: bypassImageOptimization(asset.url), width: asset.width, height: asset.height,
    // PERF-r5: sized to the 4차 hero slot (952 at 1440, beside the aside from 1024), the campaign art to its 46% column.
    sizes: campaign ? homeHeroCampaignSizes() : homeHeroSizes(),
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
  return failed ? <div className={styles.unavailable} data-banner-image-unavailable /> : (
    <picture className={styles.artwork} data-mobile-fallback={!banner.mobileImage}>
      <source media={desktopMedia} srcSet={desktopProps.srcSet ?? desktopProps.src} sizes={desktopProps.sizes} />
      {/* getImageProps supplies Next's optimized image sources for the responsive picture. */}
      <img {...mobileProps} alt={banner.alt} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} onError={() => setFailed(true)} />
    </picture>
  );
}

export function ManagedHomeBanner({ banner, locale, priority = false }: { banner: HomeBanner; locale: AppLocale; priority?: boolean }) {
  const gggiCampaign = banner.id === "8bf2f180-cb32-4f00-93e2-e84b570ad450";
  const guideArt = isGuideBanner(banner);
  const creatorWelcome = banner.kind === "announcement" && banner.celebrityId !== null && banner.desktopImage.width === banner.desktopImage.height;
  const artwork = <BannerArtwork key={`${banner.desktopImage.id}:${banner.mobileImage?.id ?? ""}`} banner={banner} priority={priority} creatorWelcome={creatorWelcome} campaign={gggiCampaign} />;
  return <div className={styles.root} data-managed-home-banner={banner.id} data-creator-welcome={creatorWelcome} data-guide-art={guideArt || undefined} data-missionbook={banner.id === "247861a1-27b0-4e0a-9039-b5f8f7bc1c48" || undefined} data-first-steps={banner.id === FIRST_STEPS_BANNER_ID || undefined} data-gggi-campaign={gggiCampaign || undefined}>
    <HomeHeroBanner kind={gggiCampaign ? "campaign" : creatorWelcome ? "welcome" : guideArt ? "art" : "live"} image={creatorWelcome ? artwork : null} fullImage={creatorWelcome ? undefined : artwork}
      eyebrow={banner.category && ['event','group','fanpage'].includes(banner.category) || guideArt ? bannerCategoryLabel(banner.category ?? "guide", locale) : gggiCampaign ? "GGGI × CHANGHA" : banner.kind === "regular_live" ? (locale === "ko" ? "정기 방송" : translate(locale, localizedMessages.me0d4dde550fa, "Regular LIVE")) : (locale === "ko" ? "kyaa 소식" : translate(locale, localizedMessages.m11331552a52b, "kyaa news"))}
      title={banner.title} description={banner.description}
      action={<Link href={localizedBannerHref(banner.href, locale) as Route}><span>{banner.ctaLabel}</span><ArrowRight aria-hidden="true" /></Link>} />
  </div>;
}
