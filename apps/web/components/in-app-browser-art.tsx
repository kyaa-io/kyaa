import styles from "./in-app-browser-art.module.css";

/**
 * 앱 안 브라우저(X·Instagram 등)에서 '··· → 브라우저에서 열기'를 보여 주는 그림(GROWTH-ONBOARD-RETAIN-1128).
 * 글자 없이 그림만이라 13개 언어에서 같다. 뜻은 바로 옆 글줄이 말하므로 보조 기술에서는 숨긴다.
 * 왼쪽: 앱 위쪽 막대 오른쪽 끝의 ···(눌러야 할 곳, 강조) → 오른쪽: 브라우저(나침반) 칸.
 */
export function InAppBrowserArt({ className }: Readonly<{ className?: string }>) {
  return <svg className={[styles.art, className ?? ""].filter(Boolean).join(" ")} viewBox="0 0 240 64" aria-hidden="true" focusable="false" data-in-app-art>
    <rect className={styles.frame} x="1" y="9" width="152" height="46" rx="12" />
    <rect className={styles.address} x="14" y="26" width="64" height="12" rx="6" />
    <circle className={styles.target} cx="130" cy="32" r="18" />
    <circle className={styles.dot} cx="119" cy="32" r="3" />
    <circle className={styles.dot} cx="130" cy="32" r="3" />
    <circle className={styles.dot} cx="141" cy="32" r="3" />
    <path className={styles.arrow} d="M162 32h22m-7-7 7 7-7 7" />
    <rect className={styles.frame} x="191" y="9" width="48" height="46" rx="12" />
    <circle className={styles.compass} cx="215" cy="32" r="14" />
    <path className={styles.needle} d="m221 26-4 12-8 4 4-12z" />
  </svg>;
}
