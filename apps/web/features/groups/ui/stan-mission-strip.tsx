"use client";
import type { Route } from "next";
import Link from "../../../components/fan-ui/hover-prefetch-link";
import { useDukjil } from "@/features/dukjil/ui/dukjil-provider";
import { dukjilText } from "@/features/dukjil/ui/dukjil-copy";
import { buildGuideModel } from "@/features/dukjil-guide/domain/guide-model";
import { SLOT } from "@/features/passport/ui/passport-mission-book";
import type { AppLocale } from "@/i18n/locales";
import styles from "@/features/group-wallet/ui/stan-wallet.module.css";

export type StripSlot = { kind: string | null; filled: boolean };

/** 덕질 미션 (대표 11/13 09:39): the mission book in one line — the nine stamps of the page being filled (inked when stamped, the same
 *  art in ghost gray when not) under 덕질 기록 and N/9, the whole strip one link to the mission book. A member's page comes from the
 *  passport roadmap; without one (guest, no passport yet) the catalog's first page is shown empty. */
export function StanMissionStrip({ locale, slots, href }: { locale: AppLocale; slots: StripSlot[] | null; href: string }) {
  const dukjil = useDukjil();
  const model = !slots && dukjil?.status === "on" && dukjil.catalog ? buildGuideModel(dukjil.catalog) : null;
  const shown: StripSlot[] = slots ?? model?.slots.map((slot) => ({ kind: slot.action, filled: false })) ?? [];
  if (shown.length === 0) return null;
  const filled = shown.filter((slot) => slot.filled).length, title = dukjilText(locale, "missionBookTitle");
  return <Link className={styles.strip} href={href as Route} aria-label={`${title} ${filled}/${shown.length}`} data-mission-strip="">
    <span className={styles.stripHead} aria-hidden="true"><span>{title}</span><span className={styles.stripCount}>{filled}/{shown.length} ›</span></span>
    <span className={styles.stripStamps} aria-hidden="true">{shown.map((slot, index) => {
      const art = slot.kind ? SLOT[slot.kind]?.art : undefined;
      return <img key={index} src={`/images/stamps/${slot.filled ? "ink-v1" : "ghost-v1"}/${art ?? "frame"}.webp`} alt="" width={40} height={40} data-filled={slot.filled || undefined} />;
    })}</span>
  </Link>;
}
