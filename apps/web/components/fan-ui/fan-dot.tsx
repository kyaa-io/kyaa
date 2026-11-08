import styles from "./fan-dot.module.css";

/** New-item mark (8장 ⑩): an 8px red dot, never a number. Numbers stay inside the notification list. `label` names it for screen readers
 * when the dot is the only sign (the bell's accessible name usually carries it instead). */
export function FanDot({ label, className }: Readonly<{ label?: string; className?: string }>) {
  return <span className={[styles.dot, className ?? ""].filter(Boolean).join(" ")} data-dot="" role={label ? "status" : undefined} aria-label={label} aria-hidden={label ? undefined : true} />;
}
