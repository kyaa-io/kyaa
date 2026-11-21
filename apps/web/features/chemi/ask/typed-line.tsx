"use client";

import { useEffect, useState } from "react";
import { FanText } from "@/components/fan-ui/fan-text";
import styles from "./ask.module.css";

/** 한 글자가 나타나는 간격. 두 줄 대사가 1초 남짓에 끝난다. */
const STEP_MS = 28;

/** 글자가 하나씩 나올 수 있는 환경인지. 움직임 줄이기면 대사는 처음부터 다 나온 것이다. */
export const canType = () => typeof matchMedia === "function" && !matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * 최애의 한 줄이 글자마다 나타난다. 아직 나오지 않은 글자도 자리를 차지해 상자 높이가 바뀌지 않고,
 * 화면 낭독기는 처음부터 전체 문장을 읽는다. `typing` 이 꺼지거나 움직임 줄이기면 바로 다 보인다.
 */
export function TypedLine({ text, typing, onDone }: { text: string; typing: boolean; onDone?: () => void }) {
  const letters = Array.from(text);
  const [count, setCount] = useState(() => (typing && canType() ? 0 : letters.length));
  const done = !typing || count >= letters.length;

  useEffect(() => {
    if (done) return;
    const timer = setInterval(() => setCount((value) => value + 1), STEP_MS);
    return () => clearInterval(timer);
  }, [done]);
  useEffect(() => {
    if (done) onDone?.();
    // onDone 은 그릴 때마다 새로 만들어져도 끝났을 때 한 번만 부른다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  if (done) return <FanText as="p" role="body">{text}</FanText>;
  return (
    <FanText as="p" role="body" data-typing="">
      {letters.slice(0, count).join("")}
      <span className={styles.unsaid}>{letters.slice(count).join("")}</span>
    </FanText>
  );
}
