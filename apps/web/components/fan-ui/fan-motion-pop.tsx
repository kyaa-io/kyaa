"use client";

import { LazyMotion, MotionConfig, domAnimation, m } from "motion/react";
import type { ReactNode } from "react";

const EASE = [0.2, 0, 0, 1] as const;

/** `fan-motion.tsx`가 값이 바뀐 순간에만 불러오는 Motion 본체. 첫 로드 JS에 들어가지 않는다.
 * 변환은 transform·opacity만, 1회. reduced-motion이면 MotionConfig가 변환을 끄고 투명도만 남긴다. */
export default function FanMotionPop({ kind, children }: { kind: "reward" | "complete"; children: ReactNode }) {
  const initial = kind === "complete" ? { opacity: 0, scale: 0.6 } : { opacity: 0, scale: 0.8, y: 6 };
  return <LazyMotion features={domAnimation} strict>
    <MotionConfig reducedMotion="user">
      <m.span style={{ display: "inline-flex" }} initial={initial} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }} data-fan-motion={kind}>
        {children}
      </m.span>
    </MotionConfig>
  </LazyMotion>;
}
