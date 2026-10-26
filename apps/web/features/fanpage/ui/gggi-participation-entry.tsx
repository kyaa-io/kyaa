import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CreatorAvatar } from "@/components/fan-ui/creator-avatar";
import type { AppLocale } from "@/i18n/locales";
import { gggiCopy } from "@/i18n/catalogs/features__fanpage__gggi";
import { boardHref } from "../domain/board-navigation";
import { GggiEventEntry } from "./gggi-event-entry";
import styles from "./gggi-participation-entry.module.css";

export function GggiParticipationEntry({ locale }: { locale: AppLocale }) {
  const t = gggiCopy[locale];
  return <div className={styles.stack}><GggiEventEntry locale={locale} /><section className={styles.entry} aria-labelledby="gggi-participation-heading">
    <CreatorAvatar slug="changha" src="/images/celebrities/changha/hero-mobile.jpg" size={72} photos={undefined} alt={t.changha} />
    <div className={styles.copy}>
      <h2 id="gggi-participation-heading">{t.title}</h2>
      <Link href={boardHref("gggi", locale, { source: "fans" })}>{t.board}<ArrowRight size={18} aria-hidden="true" /></Link>
    </div>
  </section>
  </div>;
}
