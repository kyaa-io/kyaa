import styles from "./official-badge.module.css";

export function OfficialBadge() {
  return <span className={styles.badge} data-official-badge><span className={styles.label} lang="en">kyaa official</span></span>;
}
