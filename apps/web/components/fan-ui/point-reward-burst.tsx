"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { AppLocale } from "@/i18n/locales";

import { celebrateReward } from "./reward-celebration";

/** Consecutive grants inside this window add up and replay one animation. */
export const POINT_REWARD_MERGE_MS = 1200;
const REWARD_VISIBLE_MS = 1500;

/**
 * Accumulates grants that arrive close together. `add` is stable; `burst.key`
 * changes on every grant so the animation restarts with the merged total.
 */
export function usePointRewardBurst() {
  const [burst, setBurst] = useState<{ points: number; stamps: number; key: number } | null>(null);
  const last = useRef(0);
  /** `stamps`: how many stamps the server says this grant stamped (0 when it did not say). */
  const add = useCallback((points: number, stamps = 0) => {
    if (!Number.isFinite(points) || points <= 0) return;
    const stamped = Number.isInteger(stamps) && stamps > 0 ? stamps : 0;
    const now = Date.now();
    const merge = now - last.current <= POINT_REWARD_MERGE_MS;
    last.current = now;
    setBurst((current) => ({ points: (merge && current ? current.points : 0) + points, stamps: (merge && current ? current.stamps : 0) + stamped, key: (current?.key ?? 0) + 1 }));
  }, []);
  const clear = useCallback(() => setBurst(null), []);
  return { burst, add, clear };
}

/**
 * 261107-2 D8: the screen-level hook for `celebrateReward` (components/fan-ui/reward-celebration.ts). Mount it where a grant
 * arrives and change `burstKey` per grant; it pops the shared coin badge and shows the shared "+20P · 도장 1" toast.
 * The toast is the announcement, so there is no extra live region (`announce` is kept for callers and no longer adds speech).
 */
export function PointRewardBurst({ locale, points, stamps = 0, label, anchor, burstKey = 0, onDone }: { locale: AppLocale; points: number; stamps?: number; label?: string; anchor?: Element | null; burstKey?: number; onDone?: () => void; announce?: boolean }) {
  const done = useRef(onDone), latest = useRef({ stamps, label, anchor });
  useEffect(() => { done.current = onDone; latest.current = { stamps, label, anchor }; });
  useEffect(() => {
    if (points <= 0 && latest.current.stamps <= 0) return;
    celebrateReward({ locale, points, ...latest.current, total: true });
    const timer = window.setTimeout(() => done.current?.(), REWARD_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [locale, points, burstKey]);
  return null;
}
