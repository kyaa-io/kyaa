"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import styles from "./rolling-number.module.css";

const ROLL_MS = 600;
/** Lower places finish a little earlier than higher ones, like an odometer whose ones wheel turns first. */
const PLACE_STAGGER_MS = 50;
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";

const reducedMotion = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isDigit = (char: string | undefined): char is string => char !== undefined && char >= "0" && char <= "9";
const defaultFormat = (value: number) => value.toLocaleString();

/** Digits the wheel passes through: up counts from the old digit to the new one, down from the new one back to the old one (top to bottom). */
function wheelDigits(from: number, to: number, direction: 1 | -1) {
  const steps = direction > 0 ? (to - from + 10) % 10 : (from - to + 10) % 10;
  const first = direction > 0 ? from : to;
  return Array.from({ length: steps + 1 }, (_, index) => (first + index) % 10);
}

type Timing = { duration?: number; easing?: string; delay?: number };

function Wheel({ from, to, direction, roll, place, duration = ROLL_MS, easing = EASE_OUT, delay = 0 }: { from: number; to: number; direction: 1 | -1; roll: number; place: number } & Timing) {
  const strip = useRef<HTMLSpanElement>(null);
  const digits = wheelDigits(from, to, direction);
  const travel = ((digits.length - 1) / digits.length) * 100;
  useLayoutEffect(() => {
    const node = strip.current;
    if (!node || typeof node.animate !== "function" || reducedMotion()) return;
    const resting = direction > 0 ? `translateY(-${travel}%)` : "translateY(0)";
    const start = direction > 0 ? "translateY(0)" : `translateY(-${travel}%)`;
    const animation = node.animate([{ transform: start }, { transform: resting }], { duration, delay: delay + place * PLACE_STAGGER_MS, easing, fill: "backwards" });
    return () => animation.cancel();
  }, [roll, direction, travel, place, duration, easing, delay]);
  return <span className={styles.wheel} aria-hidden="true">
    <span ref={strip} className={styles.strip} style={{ transform: direction > 0 ? `translateY(-${travel}%)` : undefined }}>
      {digits.map((digit, index) => <span key={index} className={styles.cell}>{digit}</span>)}
    </span>
  </span>;
}

type Roll = { from: string; direction: 1 | -1; id: number };

/** A number whose changed places roll like an odometer: up when the value grows, down when it shrinks.
 * The first render and reduced-motion show the value at once. Screen readers get the final text only.
 * `duration`, `easing` and `delay` (ms, before the first place starts) let a list slow the roll and stagger its rows; the default is 600ms. */
export function RollingNumber({ value, format = defaultFormat, className, duration, easing, delay }: { value: number; format?: (value: number) => string; className?: string } & Timing) {
  const [state, setState] = useState<{ value: number; roll: Roll | null }>({ value, roll: null });
  if (state.value !== value) {
    setState({ value, roll: { from: format(state.value), direction: value > state.value ? 1 : -1, id: (state.roll?.id ?? 0) + 1 } });
  }
  const text = format(value);
  const chars = [...text];
  const before = state.roll ? [...state.roll.from] : [];
  return <span className={[styles.number, className ?? ""].filter(Boolean).join(" ")} aria-label={text} role="img">
    {chars.map((char, index) => {
      const place = chars.length - 1 - index;
      const old = before[before.length - 1 - place];
      const roll = state.roll;
      if (roll && isDigit(char) && isDigit(old) && old !== char) {
        return <Wheel key={`${place}:wheel`} from={Number(old)} to={Number(char)} direction={roll.direction} roll={roll.id} place={place} duration={duration} easing={easing} delay={delay} />;
      }
      return <span key={`${place}:still`} className={styles.still} aria-hidden="true">{char}</span>;
    })}
  </span>;
}

/** Flashes the element's border in the brand colour once when any watched value changes after it had a value.
 * A value that first arrives (undefined → number) is a load, not a change. */
export function useChangeFlash(target: RefObject<HTMLElement | null>, values: readonly (string | number | undefined)[]) {
  const previous = useRef(values);
  const key = values.join("|");
  useLayoutEffect(() => {
    const last = previous.current;
    previous.current = values;
    const changed = values.some((value, index) => value !== undefined && last[index] !== undefined && last[index] !== value);
    const node = target.current;
    if (!changed || !node || typeof node.animate !== "function" || reducedMotion()) return;
    const animation = node.animate([
      { borderColor: "var(--color-line)", backgroundColor: "var(--color-surface)" },
      { borderColor: "var(--color-accent)", backgroundColor: "var(--color-accent-soft)", offset: 0.2 },
      { borderColor: "var(--color-accent)", backgroundColor: "var(--color-accent-soft)", offset: 0.45 },
      { borderColor: "var(--color-line)", backgroundColor: "var(--color-surface)" },
    ], { duration: 1100, easing: "ease-out" });
    return () => animation.cancel();
    // `values` is rebuilt every render; its joined key is the dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, target]);
}
