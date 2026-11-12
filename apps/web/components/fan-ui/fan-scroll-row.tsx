"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { FanIcon } from "./fan-icon";
import { ChevronLeft, ChevronRight } from "./fan-icons";
import type { AppLocale } from "@/i18n/locales";
import styles from "./fan-scroll-row.module.css";

const labels: Record<AppLocale, [string, string]> = {
  ko: ["이전", "다음"], en: ["Previous", "Next"], ja: ["前へ", "次へ"], "zh-Hans": ["上一页", "下一页"], "zh-Hant": ["上一頁", "下一頁"],
  es: ["Anterior", "Siguiente"], id: ["Sebelumnya", "Berikutnya"], vi: ["Trước", "Tiếp"], th: ["ก่อนหน้า", "ถัดไป"], pt: ["Anterior", "Seguinte"], fr: ["Précédent", "Suivant"], ru: ["Назад", "Вперёд"],
};

/**
 * The one horizontal scroll row for card rails (Shorts, the fan page's gallery line). The cards run to the container's right edge and the
 * row scrolls sideways with snap; from 768px round arrows sit on the left and right edges (44px target, 32px dark disc), disabled by
 * hiding them at the ends. A row too short to fill its width asks the owner for more through `onNearEnd` until it fills or runs out.
 * The owner styles its cards' width (`.owner li`) and, for cards with a caption under the picture, the arrows' `top` (`.owner > button`).
 */
export function FanScrollRow({ children, locale, label, className, onNearEnd, ...rest }: { children: ReactNode; locale: AppLocale; label?: string; className?: string; onNearEnd?: () => void } & Omit<React.HTMLAttributes<HTMLDivElement>, "children" | "className">) {
  const track = useRef<HTMLUListElement>(null);
  const [edge, setEdge] = useState({ start: true, end: true });
  const update = useCallback(() => {
    const node = track.current;
    if (!node) return;
    const rest = node.scrollWidth - node.clientWidth - node.scrollLeft;
    const next = { start: node.scrollLeft <= 1, end: rest <= 1 };
    setEdge(current => current.start === next.start && current.end === next.end ? current : next);
    if (rest < node.clientWidth * 1.5) onNearEnd?.();
  }, [onNearEnd]);
  // Runs after every render, so more cards arriving also re-check whether the row is filled.
  useEffect(() => { update(); });
  useEffect(() => {
    const node = track.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver(update);
    watch.observe(node);
    return () => watch.disconnect();
  }, [update]);
  const move = (direction: 1 | -1) => {
    const node = track.current;
    if (!node) return;
    node.scrollBy({ left: direction * node.clientWidth * 0.85, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };
  const [previous, next] = labels[locale];
  return <div {...rest} className={[styles.row, className].filter(Boolean).join(" ")} data-scroll-row="">
    <ul ref={track} className={styles.track} aria-label={label} onScroll={update}>{children}</ul>
    <button type="button" className={`${styles.arrow} ${styles.previous}`} aria-label={previous} hidden={edge.start} onClick={() => move(-1)}><FanIcon icon={ChevronLeft} size={16} /></button>
    <button type="button" className={`${styles.arrow} ${styles.next}`} aria-label={next} hidden={edge.end} onClick={() => move(1)}><FanIcon icon={ChevronRight} size={16} /></button>
  </div>;
}
