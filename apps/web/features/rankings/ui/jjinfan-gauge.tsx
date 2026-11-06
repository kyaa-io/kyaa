"use client";
import { dukjilText } from "@/features/dukjil/ui/dukjil-copy";
import type { AppLocale } from "@/i18n/locales";
import { jjinfanChallengeSchema } from "../domain/types";
import { useRankingResource } from "./use-ranking-resource";
import styles from "./jjinfan-gauge.module.css";
import inkStyles from "@/components/fan-ui/fan-ink.module.css";

const parse = (value: unknown) => jjinfanChallengeSchema.parse(value);

/** 찐팬 100명 게이지 for a creator an administrator turned on. The promise wording is what the administrator wrote; the app adds only the count. Off, loading or unreadable: no section at all. */
export function JjinfanGauge({ slug, locale }: { slug: string; locale: AppLocale }) {
  const { state } = useRankingResource(`/api/pages/${encodeURIComponent(slug)}/jjinfan-challenge`, parse);
  if (state.status !== "ready" || !state.data.campaign) return null;
  const { count, target, campaign } = state.data;
  return (
    <section className={`${styles.gauge} ${inkStyles.palette}`} aria-label={campaign.title} data-jjinfan-gauge>
      <h2>{campaign.title}</h2>
      <p className={styles.count}><span>{dukjilText(locale, "roomJjinfan")}</span><strong>{dukjilText(locale, "gaugeCount", [count.toLocaleString(locale), target.toLocaleString(locale)])}</strong></p>
      <div className={styles.bar} role="progressbar" aria-label={campaign.title} aria-valuemin={0} aria-valuemax={target} aria-valuenow={Math.min(count, target)}><i style={{ width: `${Math.min(100, Math.round((count / target) * 100))}%` }} /></div>
      {campaign.description && <p className={styles.description}>{campaign.description}</p>}
    </section>
  );
}
