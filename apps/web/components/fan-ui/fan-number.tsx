"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./fan-number.module.css";

const COUNT_MS = 400;

function prefersReducedMotion() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** 값이 바뀔 때만 이전→새 값으로 400ms 카운트업. 첫 마운트와 reduced-motion은 즉시. */
function useCountUp(value: number, enabled: boolean) {
  const [shown, setShown] = useState(value);
  const previous = useRef(value);
  useEffect(() => {
    const from = previous.current;
    previous.current = value;
    if (!enabled || from === value || prefersReducedMotion() || typeof requestAnimationFrame !== "function") {
      setShown(value);
      return;
    }
    const start = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const t = Math.min(1, (now - start) / COUNT_MS);
      const eased = 1 - (1 - t) ** 3;
      setShown(Math.round(from + (value - from) * eased));
      if (t < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [value, enabled]);
  return shown;
}

/** 값이 바뀐 뒤 한 번만 `data-pulse`를 붙였다가 떼어 낸다(상시 깜빡임 없음). */
function usePulse(value: number, enabled: boolean): [boolean, () => void] {
  const [pulse, setPulse] = useState(false);
  const previous = useRef(value);
  useEffect(() => {
    if (previous.current === value) return;
    previous.current = value;
    if (!enabled || prefersReducedMotion()) return;
    setPulse(true);
    const timer = window.setTimeout(() => setPulse(false), COUNT_MS);
    return () => window.clearTimeout(timer);
  }, [value, enabled]);
  // The pulse ends with its animation; the timer only covers a browser that fires no animationend.
  return [pulse, () => setPulse(false)];
}

export type FanNumberProps = Readonly<{
  value: number;
  /** 숫자 뒤 한 번: `P`, `장`, `°`, `명`(문구는 화면이 넘긴다). */
  unit?: ReactNode;
  /** md 16/700 · lg 24/850 · xl 24(390)/32(768+)/850 */
  size?: "md" | "lg" | "xl";
  countUp?: boolean;
  pulseOnChange?: boolean;
  locale: string;
  /** 앞 아이콘(코인 등). 장식이라 aria-hidden으로 그린다. */
  icon?: ReactNode;
  className?: string;
}>;

/** 자산 숫자(포인트·응모권·도장·온도). tabular-nums에 최대 자릿수 폭을 미리 잡아 카운트업 중에도 폭이 변하지 않는다.
 * `aria-live`는 붙이지 않는다(호출 쪽이 한 번만). 화면 판독기는 최종 값만 읽는다. */
export function FanNumber({ value, unit, size = "md", countUp = false, pulseOnChange = false, locale, icon, className }: FanNumberProps) {
  const shown = useCountUp(value, countUp);
  const [pulse, endPulse] = usePulse(value, pulseOnChange);
  const formatted = shown.toLocaleString(locale);
  const final = value.toLocaleString(locale);
  const counting = shown !== value;
  // 카운트업 중에만 최종 값 폭을 잡아 옆 요소가 흔들리지 않게 한다. 멈춘 값은 글자 폭 그대로(앞 빈칸 없음).
  return <span className={[styles.number, styles[size], className ?? ""].filter(Boolean).join(" ")} data-number-role="asset" data-pulse={pulse ? "true" : undefined} onAnimationEnd={pulse ? endPulse : undefined}>
    {icon ? <span className={styles.icon} aria-hidden="true">{icon}</span> : null}
    <span className={styles.value} style={counting ? { minWidth: `${Math.max(formatted.length, final.length)}ch` } : undefined} aria-hidden={counting ? true : undefined}>{formatted}</span>
    {counting ? <span className={styles.srOnly}>{final}</span> : null}
    {unit ? <span className={styles.unit}>{unit}</span> : null}
  </span>;
}

export type FanGaugeProps = Readonly<{
  value: number;
  max: number;
  /** progressbar 이름. */
  label: string;
  size?: "sm" | "md";
  /** 막대 오른쪽 13/700 글자(`4/6`). 막대 안에 넣지 않는다. */
  valueText?: ReactNode;
  /** 칸 나눔(7일 등). 칸 사이 2px. */
  segments?: number;
  className?: string;
}>;

/** 남은 양을 보여 주는 막대. 채움 폭 변화는 `--motion-layout`. */
export function FanGauge({ value, max, label, size = "md", valueText, segments, className }: FanGaugeProps) {
  const safeMax = Math.max(0, max);
  const clamped = Math.min(Math.max(0, value), safeMax);
  const ratio = safeMax === 0 ? 0 : clamped / safeMax;
  const text = typeof valueText === "string" ? valueText : `${clamped}/${safeMax}`;
  return <span className={[styles.gauge, styles[`gauge-${size}`], className ?? ""].filter(Boolean).join(" ")}>
    <span className={styles.track} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={safeMax} aria-valuenow={clamped} aria-valuetext={text} data-segments={segments ? "true" : undefined}>
      {segments && segments > 1
        ? Array.from({ length: segments }, (_, index) => <span key={index} className={styles.segment} data-filled={index < Math.round(ratio * segments) ? "true" : undefined} />)
        : <span className={styles.fill} style={{ transform: `scaleX(${ratio})` }} />}
    </span>
    {valueText !== undefined ? <span className={styles.gaugeText} aria-hidden="true">{valueText}</span> : null}
  </span>;
}
