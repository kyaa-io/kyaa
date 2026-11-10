import { Heart, MessageCircle } from "lucide-react";
import type { AppLocale } from "@/i18n/locales";
import styles from "./reaction-count.module.css";

/** Filled like or comment icon for post cards and lists. `pressed` is only for a like toggle the viewer has not used yet (soft pink). */
export function ReactionIcon({ kind, size = 16, pressed }: { kind: "like" | "comment"; size?: number; pressed?: boolean }) {
  const Icon = kind === "like" ? Heart : MessageCircle;
  return <Icon size={size} fill="currentColor" strokeWidth={0} aria-hidden="true" className={styles.icon} data-reaction={kind} data-pressed={pressed === undefined ? undefined : String(pressed)} />;
}

/** The count beside a reaction icon: tabular, and lighter when it is zero. */
export function ReactionCount({ value, locale }: { value: number; locale: AppLocale }) {
  return <span className={styles.count} data-zero={value === 0 || undefined}>{value.toLocaleString(locale)}</span>;
}
