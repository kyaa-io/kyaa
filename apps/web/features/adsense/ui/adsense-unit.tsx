"use client";

import { createContext, useContext, useEffect, useRef } from "react";
import { FanTag } from "@/components/fan-ui/fan-tag";
import { bannerCategoryLabel } from "@/features/home/domain/banner-category";
import type { AppLocale } from "@/i18n/locales";
import { ADSENSE_CLIENT } from "../../../security-headers";
import type { AdsensePlacement, AdsenseUnits } from "../adsense-units";
import styles from "./adsense-unit.module.css";

const AdsenseUnitsContext = createContext<AdsenseUnits | null>(null);

export function AdsenseUnitsProvider({ units, children }: { units: AdsenseUnits | null; children: React.ReactNode }) {
  return <AdsenseUnitsContext.Provider value={units}>{children}</AdsenseUnitsContext.Provider>;
}

export function useAdsenseUnit(placement: AdsensePlacement): string | undefined {
  return useContext(AdsenseUnitsContext)?.[placement];
}

type AdsbygoogleQueue = Array<Record<string, never>> & { requestNonPersonalizedAds?: 0 | 1 };

/**
 * One AdSense display unit with its `광고` label. Without an ad unit ID for this space it draws nothing. With one, the
 * space has a fixed height from the first paint, so the page never moves when the ad arrives; if AdSense has no ad for it
 * (before approval, no demand) the whole space is hidden. Ads are always requested non-personalized: the only consent this
 * site asks is for visit statistics (GA4), not for ad personalization.
 */
export function AdsenseUnit({ placement, locale, className }: { placement: AdsensePlacement; locale: AppLocale; className?: string }) {
  const slot = useAdsenseUnit(placement);
  const unit = useRef<HTMLModElement>(null);
  useEffect(() => {
    const element = unit.current;
    // adsbygoogle.js marks a unit it has taken; React's development double effect must not push a second time.
    if (!slot || !element || element.dataset.adsbygoogleStatus) return;
    const queue: AdsbygoogleQueue = ((window as unknown as { adsbygoogle?: AdsbygoogleQueue }).adsbygoogle ??= [] as unknown as AdsbygoogleQueue);
    queue.requestNonPersonalizedAds = 1;
    try { queue.push({}); } catch { /* the space stays empty; adsbygoogle.js reports its own errors */ }
  }, [slot]);
  if (!slot) return null;
  return <aside className={[styles.space, className].filter(Boolean).join(" ")} data-adsense-placement={placement} aria-label={bannerCategoryLabel("ad", locale)}>
    <FanTag tone="neutral" className={styles.label}>{bannerCategoryLabel("ad", locale)}</FanTag>
    <ins ref={unit} className={`adsbygoogle ${styles.unit}`} data-ad-client={ADSENSE_CLIENT} data-ad-slot={slot} />
  </aside>;
}
