import styles from "./verified-mark.module.css";

/** The kyaa official mark after a page name, like a verified check: icon only, its name read aloud and shown on hover.
 * The leading space keeps the name and "kyaa official" apart when read; a flex row drops it and uses its own gap. */
export function VerifiedMark({ className }: { className?: string }) {
  return (
    <>{" "}<span
      className={[styles.mark, className].filter(Boolean).join(" ")}
      role="img"
      aria-label="kyaa official"
      title="kyaa official"
      data-verified-mark=""
    >
      <svg viewBox="85.6 85.6 852.8 852.8" width="100%" height="100%" aria-hidden="true" display="block">
        <g transform="translate(0 1024) scale(.1 -.1)"><path fill="var(--color-accent-line)" d="M5070 9197 c-3 -3 -43 -7 -90 -10 -197 -13 -425 -99 -630 -235 -104 -69 -316 -279 -418 -413 -77 -102 -98 -121 -182 -165 -54 -28 -56 -28 -195 -24 -287 10 -536 4 -605 -15 -36 -9 -76 -19 -89 -22 -24 -4 -94 -27 -171 -56 -231 -85 -520 -313 -657 -515 -81 -120 -75 -110 -130 -232 -105 -231 -142 -465 -112 -715 36 -309 8 -390 -194 -558 -231 -192 -379 -393 -480 -647 -60 -153 -106 -420 -93 -543 3 -28 8 -81 11 -117 26 -335 262 -735 585 -992 171 -136 201 -218 175 -473 -36 -350 1 -564 146 -855 146 -290 376 -513 672 -649 48 -22 87 -38 87 -36 0 2 15 -2 33 -10 45 -18 198 -55 266 -63 101 -12 395 -4 496 13 190 33 306 -19 443 -200 114 -150 306 -324 459 -418 63 -38 253 -130 253 -122 0 2 17 -3 38 -12 57 -24 188 -53 272 -61 544 -50 996 160 1370 637 134 170 245 214 455 177 257 -44 548 -20 782 65 562 205 950 826 892 1429 -17 182 -17 325 1 365 7 17 14 35 16 42 5 27 64 90 186 200 203 182 320 324 403 493 20 41 43 86 49 100 12 22 23 57 72 220 43 143 40 487 -6 656 -90 331 -291 621 -589 850 -66 51 -118 121 -141 189 -16 47 -16 207 -1 310 23 154 6 403 -38 560 -68 243 -183 438 -361 615 -197 196 -391 300 -700 376 -95 23 -433 26 -583 5 -184 -26 -294 21 -405 174 -128 176 -300 347 -455 452 -155 105 -420 204 -582 217 -156 13 -250 18 -255 13z"/></g>
        <path d="m305 510 145 145 275-288" fill="none" stroke="var(--color-accent-ink)" className={styles.check} strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </span></>
  );
}
