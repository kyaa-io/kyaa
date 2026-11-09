import type { ReactNode } from "react";
import { FanSectionLink } from "./fan-section-link";
import styles from "./fan-heading.module.css";

export type FanHeadingVariant = "standard" | "editorial" | "personal-page" | "personal-section";

/** Semantic level is independent of visual role. No style/className escape hatch. */
export function FanHeading({ as: Tag = "h2", variant = "standard", id, children }: {
  as?: "h1" | "h2" | "h3";
  variant?: FanHeadingVariant;
  id?: string;
  children: ReactNode;
}) {
  const level = Tag === "h1" || variant === "personal-page" ? styles.page : styles.section;
  return <Tag id={id} className={[styles.heading, level].join(" ")} data-fan-heading={variant}>{children}</Tag>;
}

/** Title and navigation share a row; supporting copy stays below both. */
export function FanSectionHeader({ title, description, action, extraAction, variant = "standard", as = "h2", id }: {
  title: ReactNode;
  description?: ReactNode;
  action?: { label: string; href: string };
  /** Optional second text link beside `action` (same row, same style). */
  extraAction?: { label: string; href: string };
  variant?: "standard" | "editorial" | "personal";
  as?: "h1" | "h2" | "h3";
  id?: string;
}) {
  return <div className={variant === "personal" ? `${styles.sectionHeader} ${styles.personal}` : styles.sectionHeader} data-fan-section-header={variant}>
    <div className={styles.headingRow}>
      <div className={styles.copy}>
        <FanHeading as={as} id={id} variant={variant === "personal" ? "personal-section" : variant}>{title}</FanHeading>
      </div>
      {action && extraAction ? <div className={styles.actions}>
        <FanSectionLink href={action.href}>{action.label}</FanSectionLink>
        <FanSectionLink href={extraAction.href}>{extraAction.label}</FanSectionLink>
      </div> : action ? <FanSectionLink className={styles.action} href={action.href}>{action.label}</FanSectionLink> : null}
    </div>
    {description != null ? <p className={styles.description}>{description}</p> : null}
  </div>;
}
