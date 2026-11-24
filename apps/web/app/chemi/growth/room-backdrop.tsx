"use client";

import { useEffect, useState } from "react";
import styles from "./growth.module.css";

export type Stage = "baby" | "kid" | "star";

/** 방 그림은 단계마다 한 장이다. 390(약 358px·3배)과 1440(약 612px·2배)에 맞춘 두 크기. */
const roomSet = (character: string, stage: Stage) => ({
  src: `/chemi/grow/room-${character}-${stage}-720.webp`,
  srcSet: `/chemi/grow/room-${character}-${stage}-720.webp 720w, /chemi/grow/room-${character}-${stage}-1280.webp 1280w`,
});
/** 단계가 막 오른 화면에서 지난 방을 보여 주는 시간. 그 뒤 새 방이 --motion-reward 동안 겹쳐 나타난다. */
const HOLD_MS = 700;
const SIZES = "(min-width: 64rem) min(48vw, 68svh), 100vw";

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** 최애 키우기 방 배경. 단계가 바뀌면 지난 방 위로 새 방이 서서히 나타난다(움직임 줄이기에서는 바로 바뀜). */
export function RoomBackdrop({ character, stage, from }: { character: string; stage: Stage; from?: Stage }) {
  const [shown, setShown] = useState<Stage>(() => (from && from !== stage && !reduced() ? from : stage));
  const [previous, setPrevious] = useState<Stage>();

  useEffect(() => {
    if (shown === stage) return;
    const timer = window.setTimeout(() => {
      setPrevious(reduced() ? undefined : shown);
      setShown(stage);
    }, previous === undefined && shown === from ? HOLD_MS : 0);
    return () => window.clearTimeout(timer);
  }, [from, previous, shown, stage]);

  return (
    <>
      {previous && <img className={styles.roomImage} {...roomSet(character, previous)} sizes={SIZES} alt="" width={1280} height={1280} />}
      <img
        key={shown}
        className={styles.roomImage}
        data-entering={previous ? "" : undefined}
        onAnimationEnd={() => setPrevious(undefined)}
        {...roomSet(character, shown)}
        sizes={SIZES}
        alt=""
        width={1280}
        height={1280}
        data-room-stage={shown}
      />
    </>
  );
}
