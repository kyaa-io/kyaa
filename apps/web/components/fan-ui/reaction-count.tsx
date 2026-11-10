import { Heart, MessageCircle } from "lucide-react";
import type { AppLocale } from "@/i18n/locales";
import { FanIcon, type FanIconSize } from "./fan-icon";
import styles from "./reaction-count.module.css";

/** Filled like or comment icon for post cards and lists ([운영] 11/10 19:50). `pressed` is only for a like toggle the viewer has not used yet (soft pink). */
export function ReactionIcon({ kind, size = 16, pressed }: { kind: "like" | "comment"; size?: FanIconSize; pressed?: boolean }) {
  return <FanIcon icon={kind === "like" ? Heart : MessageCircle} size={size} filled className={styles.icon} data-reaction={kind} data-pressed={pressed === undefined ? undefined : String(pressed)} />;
}

/** The count beside a reaction icon: tabular, and lighter when it is zero. */
export function ReactionCount({ value, locale }: { value: number; locale: AppLocale }) {
  return <span className={styles.count} data-zero={value === 0 || undefined}>{value.toLocaleString(locale)}</span>;
}
