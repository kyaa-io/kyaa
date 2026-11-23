"use client";
import { ArrowUpRight } from "lucide-react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanSectionHeader } from "@/components/fan-ui/fan-heading";
import type { AppLocale } from "@/i18n/locales";
import { waveEngagementCopy } from "@/i18n/catalogs/features__fanpage__wave-engagement";
import { boardHref } from "../domain/board-navigation";
import { WAVE_FANPAGE_SLUG } from "../domain/wave-programs";
import { CheerComments } from "./cheer-comments";
import { creatorName } from "../domain/creator-names";
import styles from "./wave-programs.module.css";

export function WaveLivePanel({ locale }: { locale: AppLocale }) {
  const copy = waveEngagementCopy(locale);
  // 한국어 화면은 한글·영문을 함께, 다른 언어 화면은 그 언어 표기만(한글 없이).
  const changha = locale === "ko" ? "창하 · Changha" : creatorName("changha", locale);
  const wena = locale === "ko" ? "위나 · WENA" : "WENA";
  return <section className={styles.live} data-outbound-placement="content" data-outbound-kind="social">
    <div><FanSectionHeader title="TikTok LIVE" />
    <ul className={styles.list}>{[
      { name: changha, url: "https://www.tiktok.com/@chang._.a/live" },
      { name: wena, url: "https://www.tiktok.com/@wena_official_/live" },
    ].map(item => <li key={item.url}><div className={styles.liveRow}><strong>{item.name}</strong><FanAction href={item.url} external target="_blank" trailingIcon={<ArrowUpRight size={18} />}>{copy.watch}</FanAction></div></li>)}</ul></div>
    <CheerComments slug={WAVE_FANPAGE_SLUG} name={`${changha} & ${wena}`} locale={locale} liveRefresh returnTo={boardHref(WAVE_FANPAGE_SLUG, locale, { section: "live" })} />
  </section>;
}
