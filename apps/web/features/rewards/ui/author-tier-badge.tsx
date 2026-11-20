import type { AppLocale } from "@/i18n/locales";
import type { PublicAuthorTier } from "../domain/public-author-tier";
import { FanTierBadge } from "./fan-tier-badge";
import { levelLabel } from "@/features/passport/domain/passport-read-model";
import styles from "./author-tier-badge.module.css";

export function AuthorTierBadge({ tier, locale }: { tier?: PublicAuthorTier | null; locale: AppLocale }) {
  if (!tier) return null;
  return <span data-author-tier className={styles.badge} role="img" aria-label={levelLabel(locale, tier)}>
    <FanTierBadge tier={tier} locale={locale} size={16} />
  </span>;
}
