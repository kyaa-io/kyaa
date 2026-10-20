"use client";
import Link from "next/link";
import type { Route } from "next";
import type { AppLocale } from "@/i18n/locales";
import { waveNavigationCopy } from "@/i18n/catalogs/features__fanpage__wave-navigation";
import { boardHref, fanPageHref } from "../domain/board-navigation";
import { WAVE_FANPAGE_SLUG, waveProgramHref } from "../domain/wave-programs";
import { WavePrivacyNotice } from "./wave-privacy";
import styles from "./wave-navigation.module.css";
export type WaveSection = "home" | "introductions" | "friends" | "live" | "insight" | "media" | "entries";
export const WAVE_SECTIONS = ["home", "introductions", "friends", "live", "insight", "media", "entries"] as const;
export function waveSectionHref(section: WaveSection, locale: AppLocale): Route {
  switch (section) {
    case "introductions": return boardHref(WAVE_FANPAGE_SLUG, locale, { source: "fans" });
    case "friends": return `/${WAVE_FANPAGE_SLUG}?tab=friends&locale=${locale}#celebrity-content` as Route;
    case "live": return boardHref(WAVE_FANPAGE_SLUG, locale, { section: "live" });
    case "insight": return waveProgramHref("live-insight", locale) as Route;
    case "media": return boardHref(WAVE_FANPAGE_SLUG, locale, { section: "media" });
    case "entries": return fanPageHref(WAVE_FANPAGE_SLUG, locale, "events");
    default: return fanPageHref(WAVE_FANPAGE_SLUG, locale, "home");
  }
}
export function WaveNavigation({ locale, active }: { locale: AppLocale; active?: WaveSection }) {
  const copy = waveNavigationCopy(locale);
  return <><nav id="celebrity-content" className={styles.navigation} aria-label="Kyaa Wave">
    {WAVE_SECTIONS.map((section, index) => <Link key={section} href={waveSectionHref(section, locale)} aria-current={active === section ? "page" : undefined}>{copy.labels[index]}</Link>)}
  </nav><WavePrivacyNotice locale={locale} /></>;
}
