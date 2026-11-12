"use client";

import { useEffect, useRef, type ElementType, type ReactNode } from "react";

/**
 * 인쇄 소품이 화면에 들어올 때 한 번 움직이게 한다(DESIGN.md §3 캠페인 소품). 움직임 자체는 fan-print.module.css 가 정한다.
 * 처음부터 화면 안에 있거나, 움직임 줄이기 설정이거나, 스크립트가 없으면 아무것도 하지 않아 소품이 그대로 보인다.
 */
export function FanPrintReveal({ as = "div", className, children }: Readonly<{ as?: "div" | "ol" | "ul"; className?: string; children: ReactNode }>) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined" || typeof matchMedia !== "function" || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (element.getBoundingClientRect().top < window.innerHeight) return;
    element.dataset.fanPrintReveal = "armed";
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      element.dataset.fanPrintReveal = "in";
      observer.disconnect();
    }, { threshold: 0.3 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const Tag = as as ElementType;
  return <Tag ref={ref} className={className}>{children}</Tag>;
}
