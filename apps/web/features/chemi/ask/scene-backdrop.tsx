"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { MediaBackdrop, mediaFillClass } from "@/components/fan-ui/media-fill";
import { SceneVideo } from "@/features/chemi/ui/scene-video";
import styles from "./ask.module.css";

/**
 * 화면 전체를 채우는 장면 배경. 그림이 먼저 보이고, 반복 영상은 재생이 시작된 뒤에만 그 위에 나타난다(`SceneVideo`).
 * 영상은 가로 화면에서만 쓴다(가로 원화와 같은 구도로 만든 것만 있다).
 */
export function SceneBackdrop({ tall, wide, loop, alt, expression }: { tall: string; wide: string; loop: string | null; alt: string; expression?: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const art = useRef<HTMLImageElement>(null);

  // 다가가기는 원화 해상도 안에서만: 원화 한 픽셀이 화면 한 픽셀보다 커지지 않는 배율까지만 허용한다.
  // 영상은 원화보다 해상도가 낮아서 영상을 쓰는 가로 화면에서는 다가가지 않는다.
  useEffect(() => {
    const frame = box.current;
    const image = art.current;
    if (!frame || !image) return;
    const measure = () => {
      if (!image.naturalWidth || !frame.clientWidth) return;
      const cover = Math.max(frame.clientWidth / image.naturalWidth, frame.clientHeight / image.naturalHeight);
      const withLoop = Boolean(loop) && matchMedia("(min-width: 64rem)").matches;
      const room = withLoop ? 1 : Math.max(1, Math.floor(1000 / (cover * devicePixelRatio)) / 1000);
      frame.style.setProperty("--ask-room", String(room));
    };
    measure();
    image.addEventListener("load", measure);
    addEventListener("resize", measure);
    return () => {
      image.removeEventListener("load", measure);
      removeEventListener("resize", measure);
    };
  }, [tall, wide, loop]);

  return (
    <div className={styles.backdrop} ref={box}>
      <div className={styles.art}>
        <picture>
          <source media="(min-width: 64rem)" srcSet={wide} />
          <img ref={art} src={tall} alt={alt} />
        </picture>
        {expression}
      </div>
      {loop ? (
        <div className={`${styles.loop} ${mediaFillClass}`}>
          <MediaBackdrop src={wide} />
          <SceneVideo src={loop} objectPosition="center 26%" />
        </div>
      ) : null}
      <span className={styles.light} aria-hidden="true" />
    </div>
  );
}
