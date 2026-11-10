"use client";

import { useEffect, useRef, useState, type CSSProperties, type SyntheticEvent } from "react";
import { Play, Volume2, VolumeX } from "lucide-react";
import styles from "./feed-video.module.css";

/** Share of the video that must be on screen before it autoplays. */
export const FEED_VIDEO_VISIBLE_RATIO = 0.6;

const ratios = new Map<string, number>();
const listeners = new Set<(activeId: string | null) => void>();

function mostVisible(): string | null {
  let best: string | null = null;
  let bestRatio = FEED_VIDEO_VISIBLE_RATIO - Number.EPSILON;
  for (const [id, ratio] of ratios) if (ratio >= FEED_VIDEO_VISIBLE_RATIO && ratio > bestRatio) { best = id; bestRatio = ratio; }
  return best;
}
function report(id: string, ratio: number) {
  if (ratio > 0) ratios.set(id, ratio); else ratios.delete(id);
  const active = mostVisible();
  listeners.forEach(listener => listener(active));
}

/** Reduced motion and Save-Data turn autoplay off; the viewer starts the video with the play button. */
export function feedAutoplayAllowed(): boolean {
  if (typeof window === "undefined") return false;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches && connection?.saveData !== true && "IntersectionObserver" in window;
}

let nextId = 0;

export function FeedVideo({ src, width, height, label, soundOnLabel = "소리 켜기", soundOffLabel = "소리 끄기", playLabel = "재생", onError }: { src: string; width: number; height: number; label: string; soundOnLabel?: string; soundOffLabel?: string; playLabel?: string; onError?: (event: SyntheticEvent<HTMLVideoElement>) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [id] = useState(() => `feed-video-${nextId++}`);
  const [autoplay, setAutoplay] = useState(false);
  const [muted, setMuted] = useState(true);
  const [manual, setManual] = useState(false);

  useEffect(() => { setAutoplay(feedAutoplayAllowed()); }, []);
  useEffect(() => {
    const element = video.current;
    if (!autoplay || !element) return;
    const observer = new IntersectionObserver(([entry]) => report(id, entry?.intersectionRatio ?? 0), { threshold: [0, 0.25, FEED_VIDEO_VISIBLE_RATIO, 0.8, 1] });
    observer.observe(element);
    const listener = (active: string | null) => {
      if (active === id) void element.play().catch(() => undefined);
      else element.pause();
    };
    listeners.add(listener);
    return () => { observer.disconnect(); listeners.delete(listener); report(id, 0); };
  }, [autoplay, id]);

  const ratio = width > 0 && height > 0 ? `${width} / ${height}` : "16 / 9";
  const style = { "--feed-video-ratio": width > 0 && height > 0 ? String(width / height) : "1.7778", aspectRatio: ratio } as CSSProperties;
  return <span className={styles.frame} style={style} data-feed-video="">
    <video ref={video} className={styles.video} src={src} muted={muted} loop={autoplay} playsInline preload="metadata" controls={!autoplay && manual} aria-label={label} width={width} height={height} onError={onError} />
    {autoplay && <button type="button" className={styles.control} aria-label={muted ? soundOnLabel : soundOffLabel} aria-pressed={!muted} onClick={() => { const next = !muted; setMuted(next); if (video.current) video.current.muted = next; }}>{muted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}</button>}
    {!autoplay && !manual && <button type="button" className={`${styles.control} ${styles.play}`} aria-label={playLabel} onClick={() => { setManual(true); setMuted(false); if (video.current) { video.current.muted = false; void video.current.play().catch(() => undefined); } }}><Play aria-hidden="true" /></button>}
  </span>;
}
