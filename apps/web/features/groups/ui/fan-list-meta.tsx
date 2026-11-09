import type { AppLocale } from "@/i18n/locales";
import { fanProfileText } from "@/features/fan-profile/fan-profile-copy";
import { fanListCopy } from "./fan-list-copy";
import { fanListTime } from "./fan-list-time";
import styles from "./group-members.module.css";

/** Reserve the full date width; only the short title label may ellipsize. */
export function FanListMeta({ locale, hearts, stamps, firstJjinfanAt, now }: {
  locale: AppLocale; hearts: number; stamps: number; firstJjinfanAt: string | null; now?: number;
}) {
  const label = fanListCopy(locale).since;
  return <span className={styles.fanMeta}>
    {hearts > 0 && firstJjinfanAt && <span className={styles.fanSince} data-fan-since>
      <span className={styles.fanSinceLabel} title={label}>{label}</span>
      <time className={styles.fanSinceDate} dateTime={firstJjinfanAt}>{fanListTime(firstJjinfanAt, locale, now)}</time>
    </span>}
    <span>{fanProfileText(locale, "rowStamps", [stamps.toLocaleString(locale)])}</span>
  </span>;
}
