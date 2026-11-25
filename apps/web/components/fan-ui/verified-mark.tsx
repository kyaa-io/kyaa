import styles from "./verified-mark.module.css";

/** The kyaa official mark after a page name, like a verified check: icon only, its name read aloud and shown on hover.
 * The leading space keeps the name and "kyaa official" apart when read; a flex row drops it and uses its own gap. */
export function VerifiedMark({ className }: { className?: string }) {
  return <>{" "}<img className={[styles.mark, className].filter(Boolean).join(" ")} src="/images/official/verified-20261125.svg" alt="kyaa official" title="kyaa official" width={16} height={16} data-verified-mark="" /></>;
}
