"use client";
import Link from "next/link";
import type { Route } from "next";
import { useBannerSlots } from "@/components/banner-slot/banner-slot-source";
import { FanTag } from "@/components/fan-ui/fan-tag";
import { bannerCategoryLabel } from "@/features/home/domain/banner-category";
import { localizedBannerHref, type HomeBanner } from "@/features/home/domain/home-banner";
import type { AppLocale } from "@/i18n/locales";
import styles from "./home-thin-banner.module.css";

/** One picture, no words laid over it, the whole strip is the link. 358×90 on 390, 1360×120 on 1440 (artwork 716×180 and 2720×240). */
export function ThinBanner({ banner, locale }: { banner: HomeBanner; locale: AppLocale }) {
  const href = localizedBannerHref(banner.href, locale);
  const external = !href.startsWith("/");
  const ad = banner.category === "ad";
  const mobile = banner.mobileImage ?? banner.desktopImage;
  const picture = <picture>
    <source media="(min-width: 64rem)" srcSet={banner.desktopImage.url} width={banner.desktopImage.width} height={banner.desktopImage.height} />
    <img src={mobile.url} width={mobile.width} height={mobile.height} alt={banner.alt || banner.title} loading="lazy" decoding="async" />
  </picture>;
  const mark = ad ? <FanTag tone="neutral" className={styles.tag}>{bannerCategoryLabel("ad", locale)}</FanTag> : null;
  return <div className={styles.strip} data-home-thin-banner data-banner-id={banner.id}>
    {external
      ? <a className={styles.link} href={href} target="_blank" rel={ad ? "sponsored noopener noreferrer" : "noopener noreferrer"} data-outbound-placement="content" data-outbound-kind="external">{picture}{mark}</a>
      : <Link className={styles.link} href={href as Route}>{picture}{mark}</Link>}
  </div>;
}

/** The managed `home_below_board` slot as a thin strip under the ranking. Nothing is drawn while it loads, when it is empty or when it fails (R8-RULE-1: the only block allowed to leave). */
export function HomeThinBanner({ locale }: { locale: AppLocale }) {
  const banner = useBannerSlots("home", locale).home_below_board;
  return banner ? <ThinBanner key={banner.id} banner={banner} locale={locale} /> : null;
}
