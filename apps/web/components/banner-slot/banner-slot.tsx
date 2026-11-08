"use client";
import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { useState } from "react";
import { FanTag } from "@/components/fan-ui/fan-tag";
import { bannerCategoryLabel } from "@/features/home/domain/banner-category";
import { localizedBannerHref, type BannerSlot as BannerSlotKey, type HomeBanner } from "@/features/home/domain/home-banner";
import type { AppLocale } from "@/i18n/locales";
import { useBannerSlots } from "./banner-slot-source";
import styles from "./banner-slot.module.css";

const areaOf = (slot: BannerSlotKey) => slot.startsWith("home_") ? "home" as const : "fanpage" as const;

/**
 * A managed banner slot. Nothing is drawn while it loads, when it is empty or when it fails: no box and no space,
 * so the page keeps the spacing it has without the slot. Spacing comes from the parent, or from `className` where the parent spaces with margins.
 */
export function BannerSlot({ slot, locale, className, excludeIds }: { slot: BannerSlotKey; locale: AppLocale; className?: string; excludeIds?: readonly string[] }) {
  const banner = useBannerSlots(areaOf(slot), locale)[slot];
  // A banner already drawn elsewhere on the page (the home hero's fallback) is not shown twice; the slot folds instead.
  return banner && !excludeIds?.includes(banner.id) ? <BannerSlotCard key={banner.id} banner={banner} slot={slot} locale={locale} className={className}/> : null;
}

export function BannerSlotCard({ banner, slot, locale, className }: { banner: HomeBanner; slot: BannerSlotKey; locale: AppLocale; className?: string }) {
  const [failed, setFailed] = useState(false);
  const href = localizedBannerHref(banner.href, locale);
  const external = !href.startsWith("/");
  const mobile = banner.mobileImage ?? banner.desktopImage;
  const body = <>
    {!failed && <picture className={styles.artwork}>
      <source media="(min-width: 768px)" srcSet={banner.desktopImage.url} width={banner.desktopImage.width} height={banner.desktopImage.height}/>
      <img src={mobile.url} width={mobile.width} height={mobile.height} alt={banner.alt} loading="lazy" decoding="async" onError={() => setFailed(true)}/>
    </picture>}
    <span className={styles.copy}>
      {banner.category === "ad" && <FanTag tone="neutral" className={styles.tag}>{bannerCategoryLabel("ad", locale)}</FanTag>}
      <strong className={styles.title}>{banner.title}</strong>
      {banner.description && <span className={styles.description}>{banner.description}</span>}
      <span className={styles.action}>{banner.ctaLabel}{external ? <ArrowUpRight size={16} aria-hidden="true"/> : <ArrowRight size={16} aria-hidden="true"/>}</span>
    </span>
  </>;
  return <div className={[styles.slot, className].filter(Boolean).join(" ")} data-banner-slot={slot} data-banner-id={banner.id} data-image-failed={failed || undefined}>
    {external
      ? <a className={styles.card} href={href} target="_blank" rel="noopener noreferrer" data-outbound-placement="content" data-outbound-kind="external">{body}</a>
      : <Link className={styles.card} href={href as Route}>{body}</Link>}
  </div>;
}
