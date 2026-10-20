"use client";
import { ArrowUpRight } from "lucide-react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanSectionHeader } from "@/components/fan-ui/fan-heading";
import type { AppLocale } from "@/i18n/locales";
import { waveEngagementCopy } from "@/i18n/catalogs/features__fanpage__wave-engagement";
import { boardHref } from "../domain/board-navigation";
import { WAVE_FANPAGE_SLUG } from "../domain/wave-programs";
import { CheerComments } from "./cheer-comments";
import styles from "./wave-programs.module.css";

export function WaveLivePanel({ locale }: { locale: AppLocale }) {
  const copy = waveEngagementCopy(locale);
  return <section data-outbound-placement="content" data-outbound-kind="social">
    <FanSectionHeader title="TikTok LIVE" description={copy.liveIntro} />
    <ul className={styles.list}>{[
      { name: "창하 · Changha", url: "https://www.tiktok.com/@chang._.a/live" },
      { name: "위나 · WENA", url: "https://www.tiktok.com/@wena_official_/live" },
    ].map(item => <li key={item.url}><div className={styles.program}><strong>{item.name}</strong><FanAction href={item.url} external target="_blank" trailingIcon={<ArrowUpRight size={18} />}>{copy.watch}</FanAction></div></li>)}</ul>
    <CheerComments slug={WAVE_FANPAGE_SLUG} name="창하 · Changha & 위나 · WENA" locale={locale} liveRefresh returnTo={boardHref(WAVE_FANPAGE_SLUG, locale, { section: "live" })} />
  </section>;
}
