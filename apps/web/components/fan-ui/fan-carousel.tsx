import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "../icons";
import styles from "./fan-carousel.module.css";

type Step = { label: string; onClick: () => void; disabled?: boolean; controls?: string };

/**
 * Shared carousel frame (PROD-DS-1958): previous/next sit beside the content, vertically centred,
 * never on top of it. `touch="swipe"` hides them below 768px where the content is swiped instead.
 */
export function FanCarouselFrame({ previous, next, touch = "arrows", children }: {
  previous?: Step;
  next?: Step;
  touch?: "arrows" | "swipe";
  children: ReactNode;
}) {
  if (!previous || !next) return <>{children}</>;
  return <div className={styles.frame} data-touch={touch} data-fan-carousel-frame>
    <button className={styles.arrow} type="button" aria-label={previous.label} aria-controls={previous.controls} disabled={previous.disabled} onClick={previous.onClick}><ChevronLeft aria-hidden="true" /></button>
    <div className={styles.content}>{children}</div>
    <button className={styles.arrow} type="button" aria-label={next.label} aria-controls={next.controls} disabled={next.disabled} onClick={next.onClick}><ChevronRight aria-hidden="true" /></button>
  </div>;
}

/** Position only: each item is a short pill, the current one three times as long. Extra controls (pause) share the row. */
export function FanCarouselIndicator({ count, current, children }: { count: number; current: number; children?: ReactNode }) {
  return <div className={styles.indicatorRow} data-fan-carousel-indicator>
    <span className={styles.indicator} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => <span key={index} data-current={index === current || undefined} />)}
    </span>
    {children}
  </div>;
}

