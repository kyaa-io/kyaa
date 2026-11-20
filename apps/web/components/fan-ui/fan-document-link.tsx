import type { ReactNode } from "react";
import styles from "./fan-action.module.css";

/** Load a new document when the destination needs its own response headers. */
export function FanDocumentLink({ href, children, className, ariaLabel }: {
  href: string; children: ReactNode; className?: string; ariaLabel?: string;
}) {
  return <a href={href} aria-label={ariaLabel} data-fan-action="" className={[styles.action, styles.text, className].filter(Boolean).join(" ")}>
    <span className={styles.label}>{children}</span>
  </a>;
}
