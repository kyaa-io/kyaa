"use client";

import { useEffect, useState } from "react";
import { useBannerSlots } from "@/components/banner-slot/banner-slot-source";
import type { HomeBanner } from "@/features/home/domain/home-banner";
import { ThinBanner } from "@/features/home/ui/home-thin-banner";
import type { AppLocale } from "@/i18n/locales";
import styles from "./groups.module.css";

export function BoardAdRail({ locale }: { locale: AppLocale }) {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const media = window.matchMedia?.("(min-width: 80rem)");
    if (!media) return;
    const update = () => setWide(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const slots = useBannerSlots("dukjil", locale, wide);
  const ads = [slots.dukjil_side, slots.dukjil_side_2, slots.dukjil_side_3]
    .filter((banner): banner is HomeBanner => banner?.category === "ad");
  if (!wide || !ads.length) return null;

  return <div className={styles.boardAdRail} data-board-ad-rail="">
    {ads.map(banner => <ThinBanner key={banner.id} banner={banner} locale={locale} size="side" />)}
  </div>;
}
