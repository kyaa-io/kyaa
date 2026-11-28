"use client";
import Link from "../../../components/fan-ui/hover-prefetch-link";
import type { Route } from "next";
import { FanText } from "@/components/fan-ui/fan-text";
import { recordLinkClick } from "@/features/analytics/client/record-link-click";
import { FanTag } from "@/components/fan-ui/fan-tag";
import { bannerCategoryLabel } from "@/features/home/domain/banner-category";
import { localizedBannerHref, type HomeBanner } from "@/features/home/domain/home-banner";
import { getPdNoticeAction, PD_SHORTS_BANNER_ID } from "@/features/home/domain/pd-shorts-banner";
import type { AppLocale } from "@/i18n/locales";
import { AdRewardBadge, useAdReward } from "./ad-reward";
import styles from "./home-thin-banner.module.css";

/**
 * One picture, no words laid over it, the whole strip is the link. 358×90 on 390, 1360×120 on 1440 (artwork 716×180 and 2720×240).
 * `size="mid"` is the 홈배너2 / 덕질배너1 row: the 찐팬100 row's box, 358×160 on 390 and 1360×240 from 768 (artwork 716×320 and 2720×480), no margin of its own.
 * `size="side"` is the 덕질배너2 column of the 덕질 tab on PC: 360×600 (artwork 720×1200, one image, no phone artwork), drawn only by a parent that shows it from 1280.
 */
export function ThinBanner({ banner, locale, sponsored = false, size = "thin" }: { banner: HomeBanner; locale: AppLocale; sponsored?: boolean; size?: "thin" | "mid" | "side" | "below-ranking-ad" | "sidebar-ad" }) {
  const pdAction = size === "sidebar-ad" && banner.id === PD_SHORTS_BANNER_ID ? getPdNoticeAction(locale) : undefined;
  const href = pdAction?.href ?? localizedBannerHref(banner.href, locale);
  const external = !href.startsWith("/");
  const ad = sponsored || banner.category === "ad";
  const mobile = size === "side" ? banner.desktopImage : banner.mobileImage ?? banner.desktopImage;
  const picture = <picture>
    {size !== "sidebar-ad" && <source media={size === "side" ? "(min-width: 80rem)" : size === "thin" ? "(min-width: 64rem)" : "(min-width: 48rem)"} srcSet={banner.desktopImage.url} width={banner.desktopImage.width} height={banner.desktopImage.height} />}
    <img src={size === "side" ? undefined : mobile.url} width={mobile.width} height={mobile.height} alt={banner.alt || banner.title} loading="lazy" decoding="async" />
  </picture>;
  const reward = useAdReward(banner);
  const trackNoticeClick = () => recordLinkClick({
    destinationHost: "kyaa.io", campaign: "groups", placement: "content", linkKind: "website",
  }, banner.id);
  const tag = ad ? <FanTag tone="neutral">{bannerCategoryLabel("ad", locale)}</FanTag> : null;
  const mark = tag || reward.mark ? <span className={styles.marks}><AdRewardBadge mark={reward.mark} locale={locale} />{tag}</span> : null;
  const compactAd = size === "below-ranking-ad" || size === "sidebar-ad";
  const content = compactAd ? <>
    <span className={styles.adCopy}>
      <span className={styles.adLabels}>{tag}{reward.mark && <AdRewardBadge mark={reward.mark} locale={locale} />}</span>
      <FanText as="strong" role="item">{banner.title}</FanText>
      <FanText role="meta">{pdAction?.label ?? banner.ctaLabel}</FanText>
    </span>
    {picture}
  </> : <>{picture}{mark}</>;
  const sizeClass = { thin: "", mid: styles.stripMid, side: styles.stripSide, "below-ranking-ad": styles.stripAd, "sidebar-ad": styles.sidebarAd }[size];
  return <div className={[styles.strip, sizeClass].filter(Boolean).join(" ")} data-home-thin-banner data-banner-id={banner.id} data-ad-banner={ad ? banner.id : undefined} data-banner-size={size}>
    {external
      ? <a className={styles.link} href={href} target="_blank" rel={ad ? "sponsored noopener noreferrer" : "noopener noreferrer"} data-outbound-placement="content" data-outbound-kind="external" onClick={reward.claim}>{content}</a>
      : <Link className={styles.link} href={href as Route} onClick={event => {
        if (pdAction && !event.defaultPrevented) trackNoticeClick();
        reward.claim();
      }} onAuxClick={pdAction ? event => {
        if (event.button === 1 && !event.defaultPrevented) trackNoticeClick();
      } : undefined}>{content}</Link>}
  </div>;
}
