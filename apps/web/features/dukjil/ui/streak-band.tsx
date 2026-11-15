"use client";
import Link from "next/link";
import type { Route } from "next";
import { Check, Gift } from "lucide-react";
import { GroupImage } from "@/features/groups/ui/group-image";
import type { AppLocale } from "@/i18n/locales";
import { streakCells } from "../domain/dukjil-ui";
import { dukjilText } from "./dukjil-copy";
import styles from "./dukjil.module.css";
import inkStyles from "@/components/fan-ui/fan-ink.module.css";

/** 연속 일수 띠 on the 덕질 tab: the longest streak among joined fan pages and its 7 days, from the same response as the rows. The whole band opens that page's check-in. */
export function StreakBand({ locale, name, imageUrl, streak, attendedToday, nextBonusIn, href, onOpen }: { locale: AppLocale; href: string; name: string; imageUrl?: string | null; streak: number; attendedToday: boolean; nextBonusIn: number | null; onOpen: () => void }) {
  const cells = streakCells(streak, attendedToday, nextBonusIn);
  return (
    <Link className={`${styles.streakBand} ${inkStyles.palette}`} href={href as Route} onClick={event => { if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); onOpen(); }} data-streak-band>
      <span className={styles.streakOwner}>
        {imageUrl ? <GroupImage locale={locale} src={imageUrl} alt="" width={32} height={32} className={styles.streakImage} /> : <span className={styles.streakImage} aria-hidden="true" />}
        <span className={styles.streakName}>{name}</span>
        <strong className={styles.streakCount}>{dukjilText(locale, "dukjilStreak", [streak])}</strong>
      </span>
      <span className={styles.streakCells} aria-hidden="true">
        {Array.from({ length: 7 }, (_, index) => (
          <span key={index} className={styles.streakCell} data-state={index < cells.filled ? "past" : index === cells.todayIndex ? "today" : "next"}>
            {index < cells.filled ? <Check size={16} /> : index === 6 ? <Gift size={16} /> : null}
          </span>
        ))}
      </span>
    </Link>
  );
}
