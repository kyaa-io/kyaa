"use client";

import { useEffect, useRef, useState } from "react";
import { Calendar, Gift, Radio, Ticket } from "lucide-react";
import styles from "./fan-motion-icon.module.css";

// 같은 모양의 정지 아이콘을 먼저 그리고, 움직이는 아이콘(Motion 포함)은 아이콘이 화면에 처음 보일 때 불러온다.
// 정적으로 가져오면 이 아이콘을 쓰는 화면을 미리 읽을 때마다(홈의 탭 미리 읽기 포함) Motion 청크가 함께 내려온다.
const staticIcons = { calendar: Calendar, ticket: Ticket, gift: Gift, radio: Radio };
type AnimatedIcons = typeof import("./fan-motion-icon-animated").animatedIcons;
let animatedModule: Promise<AnimatedIcons> | null = null;
const loadAnimated = () => (animatedModule ??= import("./fan-motion-icon-animated").then((module) => module.animatedIcons));
type IconHandle = { startAnimation(): void; stopAnimation(): void };

/** Decorative only. Labels belong to the surrounding action. */
export function FanMotionIcon({ name, size = 20, className, active = false }: {
  name: keyof typeof staticIcons;
  size?: number;
  className?: string;
  active?: boolean;
}) {
  const root = useRef<HTMLSpanElement>(null);
  const handle = useRef<IconHandle>(null);
  const [animated, setAnimated] = useState<AnimatedIcons | null>(null);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const target = element.closest("a,button,[role=tab]") ?? element;
    let visible = false;
    let stopTimer: ReturnType<typeof setTimeout> | undefined;
    let repeatTimer: ReturnType<typeof setTimeout> | undefined;
    const stop = () => {
      clearTimeout(stopTimer);
      clearTimeout(repeatTimer);
      handle.current?.stopAnimation();
      element.dataset.animating = "false";
    };
    const play = () => {
      if (!visible || reduced.matches || document.hidden || target.matches(":disabled,[aria-disabled=true]")) return;
      clearTimeout(stopTimer);
      handle.current?.startAnimation();
      element.dataset.animating = "true";
      // Radio's library animation repeats indefinitely; bound every activation.
      stopTimer = setTimeout(() => {
        handle.current?.stopAnimation();
        element.dataset.animating = "false";
      }, 1200);
    };
    const sync = () => {
      stop();
      if (active && name === "radio" && visible && !reduced.matches && !document.hidden && pointer.matches) {
        play();
        repeatTimer = setTimeout(sync, 7000);
      }
    };
    const hover = () => { if (pointer.matches) play(); };
    let alive = true;
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !reduced.matches) void loadAnimated().then((loaded) => { if (alive) setAnimated(() => loaded); }).catch(() => undefined);
      sync();
    }, { threshold: 0.1 });
    observer?.observe(element);
    target.addEventListener("pointerenter", hover);
    target.addEventListener("focusin", play);
    target.addEventListener("pointerleave", stop);
    target.addEventListener("focusout", stop);
    document.addEventListener("visibilitychange", sync);
    reduced.addEventListener("change", sync);
    pointer.addEventListener("change", sync);
    return () => {
      alive = false;
      stop();
      observer?.disconnect();
      target.removeEventListener("pointerenter", hover);
      target.removeEventListener("focusin", play);
      target.removeEventListener("pointerleave", stop);
      target.removeEventListener("focusout", stop);
      document.removeEventListener("visibilitychange", sync);
      reduced.removeEventListener("change", sync);
      pointer.removeEventListener("change", sync);
    };
  }, [active, name]);
  const Animated = animated?.[name], Static = staticIcons[name];
  return <span ref={root} className={`${styles.icon} ${className ?? ""}`} aria-hidden="true" data-fan-motion={name} data-animating="false" style={{ width: size, height: size }}>
    {Animated ? <Animated ref={handle} size={size} isAnimated={false} /> : <Static size={size} aria-hidden="true" />}
  </span>;
}
