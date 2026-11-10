"use client";

import { useEffect, useRef, useState, type CSSProperties, type SyntheticEvent } from "react";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { FanIconButton } from "@/components/fan-ui/fan-icon-button";
import { Pause, Play, Volume2, VolumeX } from "@/components/fan-ui/fan-icons";
import type { AppLocale } from "@/i18n/locales";
import { feedVideoCopy } from "./feed-video-copy";
import styles from "./feed-video.module.css";

/** Share of the video that must be on screen before it autoplays. */
export const FEED_VIDEO_VISIBLE_RATIO = 0.6;

const ratios = new Map<string, number>();
const listeners = new Set<(activeId: string | null) => void>();

export function mostVisibleFeedVideo(): string | null {
  let best: string | null = null;
  let bestRatio = FEED_VIDEO_VISIBLE_RATIO - Number.EPSILON;
  for (const [id, ratio] of ratios) if (ratio >= FEED_VIDEO_VISIBLE_RATIO && ratio > bestRatio) { best = id; bestRatio = ratio; }
  return best;
}
function report(id: string, ratio: number) {
  if (ratio > 0) ratios.set(id, ratio); else ratios.delete(id);
  const active = mostVisibleFeedVideo();
  listeners.forEach(listener => listener(active));
}

/** Reduced motion and Save-Data turn autoplay off; the viewer starts the video with the play button. */
export function feedAutoplayAllowed(): boolean {
  if (typeof window === "undefined") return false;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches && connection?.saveData !== true && "IntersectionObserver" in window;
}

let nextId = 0;

/**
 * Muted looping video that plays while it is the most visible one (at least 60%) and the tab is visible.
 * - The viewer can always pause and resume (a looping motion needs a stop control); a manual pause stays until the viewer plays again.
 * - When the browser refuses autoplay (battery saver, iOS), the player drops to a manual one: a play button, then native controls.
 * - `startManual`: the viewer already asked to play (reduced motion / Save-Data / offscreen poster), so it starts with controls and sound.
 */
export function FeedVideo({ src, width, height, label, locale, startManual = false, onError }: { src: string; width: number; height: number; label: string; locale: AppLocale; startManual?: boolean; onError?: (event: SyntheticEvent<HTMLVideoElement>) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [id] = useState(() => `feed-video-${nextId++}`);
  const [autoplay, setAutoplay] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [muted, setMuted] = useState(!startManual);
  const [manual, setManual] = useState(startManual);
  const [playing, setPlaying] = useState(false);
  const userPaused = useRef(false);
  const copy = feedVideoCopy(locale);
  const auto = autoplay && !blocked && !manual;

  useEffect(() => { setAutoplay(feedAutoplayAllowed()); }, []);
  useEffect(() => {
    const element = video.current;
    if (startManual && element) void element.play().catch(() => undefined);
  }, [startManual]);
  useEffect(() => {
    const element = video.current;
    if (!auto || !element) return;
    const observer = new IntersectionObserver(([entry]) => report(id, entry?.intersectionRatio ?? 0), { threshold: [0, 0.25, FEED_VIDEO_VISIBLE_RATIO, 0.8, 1] });
    observer.observe(element);
    const apply = (active: string | null) => {
      if (active === id && !userPaused.current && document.visibilityState === "visible") {
        element.play().catch((error: unknown) => { if ((error as { name?: string } | null)?.name === "NotAllowedError") setBlocked(true); });
      } else element.pause();
    };
    const onVisibility = () => apply(mostVisibleFeedVideo());
    listeners.add(apply);
    document.addEventListener("visibilitychange", onVisibility);
    return () => { observer.disconnect(); listeners.delete(apply); document.removeEventListener("visibilitychange", onVisibility); report(id, 0); };
  }, [auto, id]);

  const toggle = () => {
    const element = video.current; if (!element) return;
    if (element.paused) { userPaused.current = false; void element.play().catch(() => undefined); } else { userPaused.current = true; element.pause(); }
  };
  const ratio = width > 0 && height > 0 ? `${width} / ${height}` : "16 / 9";
  const style = { "--feed-video-ratio": width > 0 && height > 0 ? String(width / height) : "1.7778", aspectRatio: ratio } as CSSProperties;
  return <span className={styles.frame} style={style} data-feed-video="">
    <video ref={video} className={styles.video} src={src} muted={muted} loop={auto} playsInline preload="metadata" controls={!auto && manual} aria-label={label} width={width} height={height}
      onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={onError} />
    {auto && <>
      <FanIconButton className={`${styles.control} ${styles.pause}`} aria-label={playing ? copy.pause : copy.play} onClick={toggle}><FanIcon icon={playing ? Pause : Play} size={20} /></FanIconButton>
      <FanIconButton className={styles.control} aria-label={muted ? copy.soundOn : copy.soundOff} aria-pressed={!muted} onClick={() => { const next = !muted; setMuted(next); if (video.current) video.current.muted = next; }}><FanIcon icon={muted ? VolumeX : Volume2} size={20} /></FanIconButton>
    </>}
    {!auto && !manual && <FanIconButton className={`${styles.control} ${styles.play}`} aria-label={copy.play} onClick={() => { setManual(true); setMuted(false); if (video.current) { video.current.muted = false; void video.current.play().catch(() => undefined); } }}><FanIcon icon={Play} size={24} /></FanIconButton>}
  </span>;
}
