"use client";
import type { Route } from "next";
import Link from "next/link";
import { startTransition, useEffect, useOptimistic, useRef, type ReactNode } from "react";

import styles from "./fan-tabs.module.css";

export type FanTabItem = Readonly<{
  key: string;
  label: ReactNode;
  href?: string;
  /** 누른 즉시 부른다. `href`와 함께 쓰면 이동 전에 화면을 먼저 바꿀 수 있다. */
  onSelect?: () => void;
  /** 누르기 직전(포인터 진입·터치 시작)에 그 탭의 첫 호출을 미리 읽는다. */
  onPreload?: () => void;
}>;

/** Keeps the selected tab visible. Aligns on mount, when `current` changes, and after a width change only
 * if the tab is no longer fully visible, so manual scrolling is kept. Only the strip's own scrollLeft moves. */
function useKeepSelectedVisible(current: string) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = ref.current;
    if (!nav) return;
    const fit = (force: boolean) => {
      const link = nav.querySelector<HTMLElement>('[aria-current="page"],[aria-pressed="true"]');
      if (!link || nav.scrollWidth <= nav.clientWidth) return;
      const n = nav.getBoundingClientRect(), l = link.getBoundingClientRect();
      if (!force && l.left >= n.left - .5 && l.right <= n.right + .5) return;
      nav.scrollLeft += l.left - n.left - (n.width - l.width) / 2;
    };
    fit(true);
    const focus = (event: FocusEvent) => {
      const link = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>("a,button") : null;
      if (!link || !nav.contains(link)) return;
      const n = nav.getBoundingClientRect(), l = link.getBoundingClientRect(), pad = 4;
      if (l.left < n.left + pad) nav.scrollLeft -= n.left + pad - l.left;
      else if (l.right > n.right - pad) nav.scrollLeft += l.right - (n.right - pad);
    };
    nav.addEventListener("focusin", focus);
    const markMore = () => { nav.dataset.more = String(nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 2); };
    markMore();
    nav.addEventListener("scroll", markMore, { passive: true });
    let width = nav.clientWidth;
    const stop = () => { nav.removeEventListener("focusin", focus); nav.removeEventListener("scroll", markMore); };
    if (typeof ResizeObserver === "undefined") return stop;
    const observer = new ResizeObserver(() => { markMore(); if (nav.clientWidth === width) return; width = nav.clientWidth; fit(false); });
    observer.observe(nav);
    return () => { observer.disconnect(); stop(); };
  }, [current]);
  return ref;
}

/** 페이지 탭(`underline`)과 필터(`chip`). 누른 탭은 응답을 기다리지 않고 바로 선택 모양이 되고, 링크 탭은 스크롤을 건드리지 않는다. */
export function FanTabs({ variant = "underline", label, current, items, id, className }: Readonly<{
  variant?: "underline" | "chip";
  label: string;
  current: string;
  items: readonly FanTabItem[];
  id?: string;
  className?: string;
}>) {
  const [selected, select] = useOptimistic(current);
  const ref = useKeepSelectedVisible(selected);
  const choose = (item: FanTabItem) => startTransition(() => { select(item.key); item.onSelect?.(); });
  const cls = [styles.tabs, styles[variant], className ?? ""].filter(Boolean).join(" ");
  return <nav id={id} ref={ref} className={cls} aria-label={label} data-fan-tabs={variant}>
    {items.map((item) => {
      const preload = item.onPreload ? { onPointerEnter: item.onPreload, onTouchStart: item.onPreload } : {};
      return item.href
        ? <Link key={item.key} className={styles.tab} href={item.href as Route} scroll={false} aria-current={selected === item.key ? "page" : undefined} onNavigate={() => choose(item)} {...preload}>{item.label}</Link>
        : <button key={item.key} type="button" className={styles.tab} aria-pressed={selected === item.key} onClick={() => choose(item)} {...preload}>{item.label}</button>;
    })}
  </nav>;
}
