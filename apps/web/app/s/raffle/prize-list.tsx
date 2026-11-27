"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function PrizeList({ label, className, children }: { label: string; className: string; children: ReactNode }) {
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (!list.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
          entry.target.animate?.([{ transform: "translateY(0)" }, { transform: "translateY(-4px)" }, { transform: "translateY(0)" }], { duration: 420, easing: "ease-in-out" });
        }
      }
    });
    list.current.querySelectorAll('[data-fan-print="gift-card"]').forEach(card => observer.observe(card));
    return () => observer.disconnect();
  }, []);
  return <ol ref={list} className={className} aria-label={label}>{children}</ol>;
}
