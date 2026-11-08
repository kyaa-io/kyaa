"use client";
import { createRoot, type Root } from "react-dom/client";
import type { AppLocale } from "@/i18n/locales";
import { StampPress } from "./stamp-press";
import styles from "./stamp-slam.module.css";

/** What the stamp paid, for the reward that follows it. */
export type StampReward = { locale: AppLocale; points?: number; stamps?: number; anchor?: HTMLElement | null; label?: string };

const reducedMotion = () => typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
/** Longest the overlay may stay if the animation never reports its end (a slow device, a failed load). */
const SLAM_LIMIT_MS = 1400;
let root: Root | null = null, host: HTMLDivElement | null = null, running: Promise<void> | null = null;

/** feedback D3: a stamp lands over the whole screen — the existing stamp Lottie (stamp-press.json, 0.9s) at up to 360px, on a dim layer that
 * lets every tap through, then it fades. Once at a time (a second call joins the first). Reduced motion: no overlay, resolves at once.
 * Never blocks input: the layer is pointer-events none and aria-hidden; the screen's own text says what happened. */
export function playStampSlam(): Promise<void> {
  if (typeof document === "undefined" || reducedMotion()) return Promise.resolve();
  if (running) return running;
  running = new Promise<void>((resolve) => {
    host ??= Object.assign(document.createElement("div"), { className: styles.host });
    if (!host.isConnected) document.body.appendChild(host);
    root ??= createRoot(host);
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      host?.setAttribute("data-leaving", "");
      window.setTimeout(() => { root?.render(null); host?.removeAttribute("data-leaving"); running = null; resolve(); }, 160);
    };
    window.setTimeout(finish, SLAM_LIMIT_MS);
    root.render(<div className={styles.layer} aria-hidden="true" data-stamp-slam=""><StampPress state="press" size={360} className={styles.stamp} onDone={finish} /></div>);
  });
  return running;
}

/** The stamp first, then the common reward (coin badge + toast, feedback D8) — the one place the two meet.
 * MERGE(C t3/r4-c-post, D8): replace the body after the slam with
 *   `celebrateReward({ locale: reward.locale, points: reward.points ?? 0, stamps: reward.stamps ?? 1, anchor: reward.anchor ?? undefined, label: reward.label })`
 * from "@/components/fan-ui/reward-celebration" (server-confirmed grants only; it merges grants within 1.2s and handles reduced motion).
 * Until then `then` runs whatever the caller already shows (a toast or the screen's own burst). */
export async function celebrateStamp(reward: StampReward, then?: () => void) {
  await playStampSlam();
  then?.();
}
