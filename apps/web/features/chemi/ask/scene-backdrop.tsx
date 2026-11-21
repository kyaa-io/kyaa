"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./ask.module.css";

/**
 * 화면 전체를 채우는 장면 배경. 그림이 먼저 보이고, 반복 영상은 재생이 시작된 뒤에만 그 위에 나타난다.
 * 영상은 가로 화면에서만 쓴다(가로 원화와 같은 구도로 만든 것만 있다). 움직임 줄이기·데이터 절약·느린 망·
 * 메모리 2GB 이하 기기·재생 실패에서는 그림만 남는다. 탭이 가려지면 멈춘다.
 */
export function SceneBackdrop({ tall, wide, loop, alt }: { tall: string; wide: string; loop: string | null; alt: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [allowed, setAllowed] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!loop || typeof matchMedia !== "function") return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const landscape = matchMedia("(min-width: 64rem)");
    const device = navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string }; deviceMemory?: number };
    const update = () =>
      setAllowed(
        landscape.matches &&
          !reduced.matches &&
          device.connection?.saveData !== true &&
          !["slow-2g", "2g"].includes(device.connection?.effectiveType ?? "") &&
          (device.deviceMemory ?? 8) > 2,
      );
    update();
    reduced.addEventListener("change", update);
    landscape.addEventListener("change", update);
    return () => {
      reduced.removeEventListener("change", update);
      landscape.removeEventListener("change", update);
    };
  }, [loop]);

  useEffect(() => {
    if (!allowed) return;
    const onVisibility = () => {
      if (document.hidden) video.current?.pause();
      else void video.current?.play().catch(() => setAllowed(false));
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [allowed]);

  const shown = allowed && loop;
  return (
    <div className={styles.backdrop}>
      <picture className={styles.art}>
        <source media="(min-width: 64rem)" srcSet={wide} />
        <img src={tall} alt={alt} />
      </picture>
      {shown ? (
        <video
          ref={video}
          className={styles.loop}
          data-playing={playing ? "" : undefined}
          src={loop}
          poster={wide}
          muted
          loop
          autoPlay
          playsInline
          preload="metadata"
          aria-hidden="true"
          tabIndex={-1}
          onPlaying={() => setPlaying(true)}
          onError={() => setAllowed(false)}
        />
      ) : null}
    </div>
  );
}
