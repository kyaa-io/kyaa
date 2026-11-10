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

/** 제목 행 오른쪽 보조 행동. 이동은 `href`, 같은 화면의 펼침은 `onClick`(+`expanded`·`controls`). */
export type SectionAction = { label: string; href: string; onClick?: never; expanded?: never; controls?: never }
  | { label: string; href?: never; onClick: () => void; expanded?: boolean; controls?: string };

const renderAction = (action: SectionAction, extra?: string) => <FanSectionLink className={extra} href={action.href} onClick={action.onClick} expanded={action.expanded} controls={action.controls}>{action.label}</FanSectionLink>;

/** Title and navigation share a row; supporting copy stays below both. */
export function FanSectionHeader({ title, description, action, extraAction, variant = "standard", as = "h2", id }: {
  title: ReactNode;
  description?: ReactNode;
  action?: SectionAction;
  /** Optional second text link beside `action` (same row, same style). */
  extraAction?: SectionAction;
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
        {renderAction(action)}
        {renderAction(extraAction)}
      </div> : action ? renderAction(action, styles.action) : null}
    </div>
    {description != null ? <p className={styles.description}>{description}</p> : null}
  </div>;
}
