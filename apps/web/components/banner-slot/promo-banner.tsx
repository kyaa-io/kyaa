import Link from "next/link";
import type { Route } from "next";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { ChevronRight } from "@/components/fan-ui/fan-icons";
import { FanTag } from "@/components/fan-ui/fan-tag";
import styles from "./banner-slot.module.css";

/**
 * The common banner part for a slot whose content the code (not the banner manager) decides: an in-app link card with a title, one line and a button line, no picture.
 * Same card, type and spacing rules as the managed banner (BannerSlotCard). `tag` is the small label above the title (`광고` when the slot carries an advertisement).
 */
export function PromoBanner({ slot, href, title, description, ctaLabel, tag, className }: { slot: string; href: Route; title: string; description?: string; ctaLabel: string; tag?: string; className?: string }) {
  return <div className={[styles.slot, className].filter(Boolean).join(" ")} data-banner-slot={slot}>
    <Link className={`${styles.card} ${styles.plain}`} href={href}>
      <span className={styles.copy}>
        {tag ? <FanTag tone="neutral" className={styles.tag}>{tag}</FanTag> : null}
        <strong className={styles.title}>{title}</strong>
        {description ? <span className={styles.description}>{description}</span> : null}
        <span className={styles.action}>{ctaLabel}<FanIcon icon={ChevronRight} size={16}/></span>
      </span>
    </Link>
  </div>;
}
