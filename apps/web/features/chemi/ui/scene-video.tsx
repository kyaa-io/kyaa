"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";

import styles from "./scene-video.module.css";

type SceneVideoProps = {
  /** Extensionless URL of the MP4 and WebM pair. Render above a static poster. */
  src: string;
  mobileOnly?: boolean;
  once?: boolean;
  paused?: boolean;
  objectPosition?: string;
};
const seen = new Set<string>();

export function SceneVideo(props: SceneVideoProps) {
  return <Playback key={props.src} {...props} />;
}

function Playback({ src, mobileOnly, once, paused, objectPosition }: SceneVideoProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const video = ref.current;
    if (!video || !window.IntersectionObserver || !window.matchMedia) return;
    const nav = navigator as Navigator & { deviceMemory?: number; connection?: EventTarget & { saveData?: boolean } };
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const wide = matchMedia("(min-width: 48rem)");
    const key = "chemi-intro:" + src;
    let previous = seen.has(key);
    try { previous ||= sessionStorage.getItem(key) === "1"; } catch {}
    if (once && previous) return;
    let visible = false;
    let failed = false;
    let revision = 0;
    const update = () => {
      const attempt = ++revision;
      if (!visible || document.hidden || paused || failed || motion.matches || (mobileOnly && wide.matches) ||
          nav.connection?.saveData || (nav.deviceMemory ?? 8) <= 2 || (nav.hardwareConcurrency || 8) <= 2) {
        video.pause();
        setPlaying(false);
        return;
      }
      if (!video.hasAttribute("src")) video.src = src + (video.canPlayType("video/mp4") ? ".mp4" : ".webm");
      video.play().catch(() => { if (revision === attempt) setPlaying(false); });
    };
    const start = () => {
      setPlaying(true);
      if (once) {
        seen.add(key);
        try { sessionStorage.setItem(key, "1"); } catch {}
      }
    };
    const finish = () => { failed = true; setPlaying(false); };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); });
    observer.observe(video);
    video.addEventListener("playing", start);
    video.addEventListener("ended", finish);
    video.addEventListener("error", finish);
    const events = [[document, "visibilitychange"], [motion, "change"], [wide, "change"], [nav.connection, "change"]] as const;
    for (const [target, event] of events) target?.addEventListener(event, update);
    return () => {
      ++revision;
      observer.disconnect();
      video.pause();
      video.removeEventListener("playing", start);
      video.removeEventListener("ended", finish);
      video.removeEventListener("error", finish);
      for (const [target, event] of events) target?.removeEventListener(event, update);
    };
  }, [src, once, mobileOnly, paused]);
  return <video ref={ref} muted playsInline loop={!once} preload="none" aria-hidden="true"
    className={styles.video} data-playing={playing || undefined}
    style={{ "--scene-focus": objectPosition } as CSSProperties} />;
}
