import { LockKeyhole } from "lucide-react";
import type { AppLocale } from "@/i18n/locales";
import { wavePrivacyCopy } from "@/i18n/catalogs/features__fanpage__wave-privacy";
import styles from "./wave-privacy.module.css";

export function WavePrivateBadge({ locale }: { locale: AppLocale }) {
  return <span className={styles.badge} title={wavePrivacyCopy(locale).audience}><LockKeyhole size={14} aria-hidden="true" /><span lang="en">Private</span><span className={styles.srOnly}> · {wavePrivacyCopy(locale).audience}</span></span>;
}

export function WavePrivacyNotice({ locale }: { locale: AppLocale }) {
  return <aside className={styles.notice} aria-label={wavePrivacyCopy(locale).audience}><WavePrivateBadge locale={locale} /><p>{wavePrivacyCopy(locale).notice}</p></aside>;
}
