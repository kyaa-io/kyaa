"use client";

import { useState } from "react";
import styles from "./growth.module.css";

export type Stage = "baby" | "kid" | "star";

/** 방 그림은 단계마다 한 장이다. 390(약 358px·3배)과 1440(약 612px·2배)에 맞춘 두 크기. */
const roomSet = (character: string, stage: Stage) => ({
  src: `/chemi/grow/room-${character}-${stage}-720.webp`,
  srcSet: `/chemi/grow/room-${character}-${stage}-720.webp 720w, /chemi/grow/room-${character}-${stage}-1280.webp 1280w`,
});
const SIZES = "(min-width: 64rem) min(48vw, 68svh), 100vw";

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** 최애 키우기 방 배경. 단계가 바뀌면 지난 방 위로 새 방이 서서히 나타난다(움직임 줄이기에서는 바로 바뀜). */
export function RoomBackdrop({ character, stage, from }: { character: string; stage: Stage; from?: Stage }) {
  const [previous, setPrevious] = useState<Stage | undefined>(() => from && from !== stage && !reduced() ? from : undefined);


  return (
    <>
      {previous && <img className={styles.roomImage} {...roomSet(character, previous)} sizes={SIZES} alt="" width={1280} height={1280} />}
      <img
        key={stage}
        className={styles.roomImage}
        data-entering={previous ? "" : undefined}
        onAnimationEnd={() => setPrevious(undefined)}
        {...roomSet(character, stage)}
        sizes={SIZES}
        alt=""
        width={1280}
        height={1280}
        data-room-stage={stage}
      />
    </>
  );
}
