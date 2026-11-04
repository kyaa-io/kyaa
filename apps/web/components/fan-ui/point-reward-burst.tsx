"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { AppLocale } from "@/i18n/locales";
import { pointRewardAnnouncement } from "@/i18n/catalogs/components__fan-ui__point-reward-burst";

import styles from "./point-reward-burst.module.css";

/** Consecutive grants inside this window add up and replay one animation. */
export const POINT_REWARD_MERGE_MS = 1200;
const MOTION_VISIBLE_MS = 1500;
const STATIC_VISIBLE_MS = 2600;

// dx/up/drop in px: coins and stars pop upward, then fall and fade.
const PARTICLES = [
  { kind: "coin", dx: -58, up: 54, drop: 14, delay: 0, size: 14 },
  { kind: "star", dx: -36, up: 74, drop: 30, delay: 40, size: 11 },
  { kind: "coin", dx: -14, up: 86, drop: 40, delay: 90, size: 12 },
  { kind: "coin", dx: 16, up: 82, drop: 36, delay: 60, size: 13 },
  { kind: "star", dx: 40, up: 70, drop: 26, delay: 20, size: 12 },
  { kind: "coin", dx: 60, up: 50, drop: 12, delay: 110, size: 14 },
] as const;

const STAR = "M32.0 8.0L40.2 22.7L56.7 26.0L45.3 38.3L47.3 55.0L32.0 48.0L16.7 55.0L18.7 38.3L7.3 26.0L23.8 22.7Z";
const MINI_STAR = "M12.0 2.0L14.9 8.5L22.0 9.3L16.8 14.0L18.2 21.0L12.0 17.5L5.8 21.0L7.2 14.0L2.0 9.3L9.1 8.5Z";

function Particle({ kind, size }: { kind: "coin" | "star"; size: number }) {
  return kind === "coin" ? (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="10.5" fill="var(--pr-coin)" stroke="var(--pr-coin-line)" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="6.6" fill="none" stroke="var(--pr-coin-inner)" strokeWidth="1.4" />
      <path d="M9.4 8.2c.9-.8 2.2-1.2 3.6-1" fill="none" stroke="var(--pr-coin-shine)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <path d={MINI_STAR} fill="var(--pr-spark)" stroke="var(--pr-spark-line)" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

/** Original star-character mark in the app's pink; no external artwork. */
function StarCharacter() {
  return (
    <svg className={styles.star} viewBox="0 0 64 64" width="56" height="56" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="point-reward-star" x1="12" y1="6" x2="52" y2="58" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--pr-star-from)" />
          <stop offset="1" stopColor="var(--pr-star-to)" />
        </linearGradient>
      </defs>
      <path d={STAR} fill="url(#point-reward-star)" stroke="var(--pr-white)" strokeWidth="2.5" strokeLinejoin="round" />
      <ellipse cx="26" cy="30" rx="2.6" ry="3.2" fill="var(--pr-face)" />
      <ellipse cx="38" cy="30" rx="2.6" ry="3.2" fill="var(--pr-face)" />
      <path d="M27.5 38c1.3 1.8 2.9 2.6 4.5 2.6s3.2-.8 4.5-2.6" fill="none" stroke="var(--pr-face)" strokeWidth="2.2" strokeLinecap="round" />
      <ellipse cx="21" cy="36" rx="3" ry="2" fill="var(--pr-cheek)" opacity=".8" />
      <ellipse cx="43" cy="36" rx="3" ry="2" fill="var(--pr-cheek)" opacity=".8" />
    </svg>
  );
}

/**
 * Accumulates grants that arrive close together. `add` is stable; `burst.key`
 * changes on every grant so the animation restarts with the merged total.
 */
export function usePointRewardBurst() {
  const [burst, setBurst] = useState<{ points: number; key: number } | null>(null);
  const last = useRef(0);
  const add = useCallback((points: number) => {
    if (!Number.isFinite(points) || points <= 0) return;
    const now = Date.now();
    const merge = now - last.current <= POINT_REWARD_MERGE_MS;
    last.current = now;
    setBurst((current) => ({ points: (merge && current ? current.points : 0) + points, key: (current?.key ?? 0) + 1 }));
  }, []);
  const clear = useCallback(() => setBurst(null), []);
  return { burst, add, clear };
}

/**
 * Fixed overlay rendered in a portal on document.body, so no `overflow: hidden`
 * ancestor or sticky header can clip it. It never takes layout space or pointer
 * input. The live region stays mounted and its text node is replaced on every
 * grant, so the same amount announces again. Pass `announce={false}` when the
 * screen already has its own completion `role="status"` to avoid double speech.
 */
export function PointRewardBurst({ locale, points, burstKey = 0, onDone, announce = true }: { locale: AppLocale; points: number; burstKey?: number; onDone?: () => void; announce?: boolean }) {
  const [visible, setVisible] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [mounted, setMounted] = useState(false);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (points <= 0) { setVisible(false); return; }
    const isReduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setReduced(isReduced);
    setVisible(true);
    const timer = window.setTimeout(() => { setVisible(false); done.current?.(); }, isReduced ? STATIC_VISIBLE_MS : MOTION_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [points, burstKey]);
  const amount = points.toLocaleString(locale);
  const overlay = mounted && visible && points > 0 ? createPortal(
    <div key={burstKey} className={styles.burst} data-reduced={reduced ? "true" : undefined} data-testid="point-reward-burst" aria-hidden="true">
      {reduced ? null : PARTICLES.map((p, index) => (
        <span key={index} className={styles.particle} style={{ "--dx": `${p.dx}px`, "--up": `${p.up}px`, "--drop": `${p.drop}px`, animationDelay: `${p.delay}ms` } as React.CSSProperties}>
          <Particle kind={p.kind} size={p.size} />
        </span>
      ))}
      <StarCharacter />
      <span className={styles.amount}>+{amount} P</span>
    </div>,
    document.body,
  ) : null;
  return (
    <>
      {announce ? (
        <span className={styles.live} role="status" aria-live="polite" aria-atomic="true">
          {points > 0 ? <span key={burstKey}>{pointRewardAnnouncement(locale, points)}</span> : null}
        </span>
      ) : null}
      {overlay}
    </>
  );
}
