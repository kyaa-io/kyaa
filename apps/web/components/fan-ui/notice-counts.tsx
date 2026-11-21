import { Eye, Heart, MessageCircle } from "lucide-react";
import type { AppLocale } from "@/i18n/locales";
import { FanIcon } from "./fan-icon";
import { fanUiText } from "./fan-ui-copy";
import styles from "./notice-counts.module.css";

export function NoticeCounts({ locale, views, comments, likes }: {
  locale: AppLocale; views?: number | null; comments?: number; likes?: number | null;
}) {
  if (views == null && comments == null && likes == null) return null;
  const counts = [[views, Eye, "viewsLabel"], [comments, MessageCircle, "commentsLabel"], [likes, Heart, "likesLabel"]] as const;
  return <span className={styles.counts}>{counts.map(([value, icon, label]) => {
    if (value == null) return null;
    const count = value.toLocaleString(locale, { notation: value >= 10000 ? "compact" : "standard" });
    return <span key={label} role="img" aria-label={fanUiText(locale, label, [count])}><FanIcon icon={icon} size={16} />{count}</span>;
  })}</span>;
}
