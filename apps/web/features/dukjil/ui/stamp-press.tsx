"use client";
import { useEffect, useRef, useState } from "react";
import styles from "./dukjil.module.css";

export type StampPressState = "idle" | "stamped" | "press";

const FINAL = "/lottie/stamp-press-final.svg";
const ANIMATION = "/lottie/stamp-press.json";

type Player = typeof import("lottie-web/build/player/lottie_light").default;
let loading: Promise<[Player, unknown]> | undefined;
/** The player stays out of every page's first load: it and the JSON are fetched once a stamp can actually be pressed. A failure is not cached. */
const loadPlayer = () => loading ??= Promise.all([
  import("lottie-web/build/player/lottie_light").then(module => module.default),
  fetch(ANIMATION).then(response => { if (!response.ok) throw new Error("STAMP_ANIMATION_UNAVAILABLE"); return response.json() as Promise<unknown>; }),
]).catch(error => { loading = undefined; throw error; });
/** Test hook. */
export const resetStampPressPlayer = () => { loading = undefined; };

const reducedMotion = () => typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

/** The stamp the fan just earned. `idle`: not stamped yet, a faint outline. `stamped`: the still final frame. `press`: plays once (0.9s) and rests on the final frame; reduced motion and a failed load go straight to the still. */
export function StampPress({ state, size = 120, className, onDone }: { state: StampPressState; size?: number; className?: string; onDone?: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);
  useEffect(() => { done.current = onDone; });
  const [still, setStill] = useState(false);
  useEffect(() => {
    if (state === "idle" && !reducedMotion()) { void loadPlayer().catch(() => {}); return; }
    if (state !== "press") return;
    if (reducedMotion()) { done.current?.(); return; }
    let live = true, destroy: (() => void) | undefined;
    loadPlayer().then(([player, animationData]) => {
      if (!live || !host.current) return;
      const animation = player.loadAnimation({ container: host.current, renderer: "svg", loop: false, autoplay: true, animationData: structuredClone(animationData) });
      animation.addEventListener("complete", () => done.current?.());
      destroy = () => animation.destroy();
    }).catch(() => { if (live) { setStill(true); done.current?.(); } });
    return () => { live = false; destroy?.(); };
  }, [state]);
  const box = { width: size, height: size };
  if (state === "press" && !still && !reducedMotion()) return <div ref={host} className={[styles.stampPress, className ?? ""].filter(Boolean).join(" ")} style={box} aria-hidden="true" data-stamp-press="press" />;
  return <img src={FINAL} alt="" width={size} height={size} aria-hidden="true" className={[styles.stampPress, state === "idle" ? styles.stampGhost : "", className ?? ""].filter(Boolean).join(" ")} data-stamp-press={state === "idle" ? "idle" : "stamped"} />;
}
