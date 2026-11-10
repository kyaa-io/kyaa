import type { ReactNode } from "react";

import type { AppLocale } from "@/i18n/locales";
import { rankingsText } from "./rankings-copy";
import styles from "./rank-highlight.module.css";

/** One row's facts the highlight reads. delta is null when the row has no comparison (or the list has none); dayGain is null when that day is not built. */
export type HighlightRow = { key: string; name: string; avatar: ReactNode; delta: number | null | undefined; dayGain: number | null | undefined };

export type Highlight =
  | { kind: "rise"; row: HighlightRow; value: number }
  | { kind: "day"; row: HighlightRow; value: number }
  | { kind: "none" };

/** Today's biggest rank climb; with no climb, the most hearts gained today; with neither, nothing. The first row wins a tie. Only real values count. */
export function pickHighlight(rows: readonly HighlightRow[]): Highlight {
  let rise: Highlight = { kind: "none" };
  let day: Highlight = { kind: "none" };
  for (const row of rows) {
    if (typeof row.delta === "number" && row.delta > 0 && (rise.kind === "none" || row.delta > rise.value)) rise = { kind: "rise", row, value: row.delta };
    if (typeof row.dayGain === "number" && row.dayGain > 0 && (day.kind === "none" || row.dayGain > day.value)) day = { kind: "day", row, value: row.dayGain };
  }
  return rise.kind !== "none" ? rise : day;
}

/** Card under the list header. `loading` keeps the empty frame at the same height; an error renders no card at all (the caller does not mount it), and a day with nothing to name draws none. */
export function RankHighlight({ locale, rows, loading = false }: { locale: AppLocale; rows: readonly HighlightRow[]; loading?: boolean }) {
  if (loading) return <div className={styles.card} data-rank-highlight="loading" aria-hidden="true" />;
  const pick = pickHighlight(rows);
  if (pick.kind === "none") return null;
  const label = rankingsText(locale, pick.kind === "day" ? "rkDayTop" : "rkRiseTop");
  const value = pick.value.toLocaleString(locale);
  return <section className={styles.card} data-rank-highlight={pick.kind} aria-label={label}>
    <span className={styles.avatar}>{pick.row.avatar}</span>
    <span className={styles.text}><span className={styles.label}>{label}</span><span className={styles.name} title={pick.row.name}>{pick.row.name}</span></span>
    {pick.kind === "rise"
      ? <span className={styles.value} aria-label={rankingsText(locale, "rkDeltaUp", [pick.value])}><svg aria-hidden="true" width="10" height="8" viewBox="0 0 10 8"><path d="M5 0 10 8H0z" fill="currentColor" /></svg><span aria-hidden="true">{value}</span></span>
      : <span className={styles.value}>{`+${value}`}</span>}
  </section>;
}
