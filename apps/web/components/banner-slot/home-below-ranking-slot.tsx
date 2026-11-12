"use client";
import Link from "@/components/fan-ui/hover-prefetch-link";
import type { Route } from "next";
import { ArrowRight } from "@/components/fan-ui/fan-icons";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanText } from "@/components/fan-ui/fan-text";
import { LiveHeroCarousel } from "@/components/live-hero-carousel";
import type { HomeBanner } from "@/features/home/domain/home-banner";
import { JJINFAN_BANNER_CREATORS, jjinfanBannerHref } from "@/features/rankings/domain/jjinfan-banner";
import { jjinfanBannerCopy } from "@/features/rankings/ui/jjinfan-banner-copy";
import type { AppLocale } from "@/i18n/locales";
import styles from "./jjinfan-banner.module.css";

export function HomeBelowRankingSlot({ locale }: { locale: AppLocale }) {
  const t = jjinfanBannerCopy[locale];
  const banners: HomeBanner[] = JJINFAN_BANNER_CREATORS.map((creator, index) => ({
    id: creator.slug, kind: "announcement", celebrityId: null, category: "fanpage",
    title: locale === "ko" ? creator.ko : creator.en, description: "", ctaLabel: t.join,
    href: jjinfanBannerHref(creator.slug, locale), alt: locale === "ko" ? creator.ko : creator.en,
    desktopImage: { id: creator.slug, url: `/images/jjinfan100/${creator.slug}.webp`, width: index === 0 ? 1067 : 1080, height: index === 0 ? 1600 : 1080, mimeType: "image/webp", revision: 1 }, mobileImage: null,
  }));
  return <div data-banner-slot="home-below-ranking"><LiveHeroCarousel homeBanners={banners} locale={locale} elinaGuide={null} compact renderBanner={(banner) =>
    <Link href={banner.href as Route} className={styles.banner} data-jjinfan-banner={banner.id}>
      <div className={styles.copy}><FanText role="banner-label" className={styles.title}>{t.title}</FanText><FanHeading variant="campaign">{banner.title}</FanHeading><FanText role="banner-action" className={styles.action}>{t.join}<FanIcon icon={ArrowRight} size={16} /></FanText></div>
      <img className={styles.portrait} src={banner.desktopImage.url} alt={banner.alt} width={banner.desktopImage.width} height={banner.desktopImage.height} loading="lazy" />
    </Link>} /></div>;
}
