"use client";
import { createRoot, type Root } from "react-dom/client";
import { celebrateReward } from "@/components/fan-ui/reward-celebration";
import type { AppLocale } from "@/i18n/locales";
import { StampPress } from "./stamp-press";
import styles from "./stamp-slam.module.css";

/** What the stamp paid, for the reward that follows it. */
export type StampReward = { locale: AppLocale; points?: number; stamps?: number; anchor?: HTMLElement | null; label?: string };

const reducedMotion = () => typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
/** Keep the earned stamp visible before fading. */
const SLAM_LIMIT_MS = 2500;
let root: Root | null = null, host: HTMLDivElement | null = null, running: Promise<void> | null = null;

/** feedback D3: a stamp lands over the whole screen — the existing stamp Lottie (stamp-press.json, 0.9s) at up to 360px, on a dim layer that
 * lets every tap through, then it fades. Once at a time (a second call joins the first). Reduced motion: the still stamp stays visible without animation.
 * Never blocks input: the layer is pointer-events none and aria-hidden; the screen's own text says what happened. */
export function playStampSlam(): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  if (running) return running;
  running = new Promise<void>((resolve) => {
    host ??= Object.assign(document.createElement("div"), { className: styles.host });
    if (!host.isConnected) document.body.appendChild(host);
    root ??= createRoot(host);
    host.style.display = "block";
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      host?.setAttribute("data-leaving", "");
      window.setTimeout(() => { root?.render(null); host?.removeAttribute("data-leaving"); running = null; resolve(); }, 160);
    };
    root.render(<div ref={node => { if (node) window.setTimeout(finish, SLAM_LIMIT_MS); }} className={styles.layer} style={reducedMotion() ? { animation: "none" } : undefined} aria-hidden="true" data-stamp-slam=""><StampPress state="press" size={360} className={styles.stamp} /></div>);
  });
  return running;
}

/** Show the confirmed reward immediately while the stamp animation plays.
 * Callers pass server-confirmed grants only; `celebrateReward` merges grants within 1.2s and handles reduced motion. */
export async function celebrateStamp(reward: StampReward) {
  celebrateReward({ locale: reward.locale, points: reward.points ?? 0, stamps: reward.stamps ?? 1, anchor: reward.anchor ?? undefined, label: reward.label });
  await playStampSlam();
}
