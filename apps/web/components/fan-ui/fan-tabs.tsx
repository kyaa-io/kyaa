"use client";
import type { Route } from "next";
import Link from "next/link";
import dynamic from "next/dynamic";
import { startTransition, useEffect, useOptimistic, useRef, type ReactNode } from "react";

import { FanCount } from "./fan-count-chip";
import styles from "./fan-tabs.module.css";

export type FanTabItem = Readonly<{
  key: string;
  label: ReactNode;
  href?: string;
  /** 누른 즉시 부른다. `href`와 함께 쓰면 이동 전에 화면을 먼저 바꿀 수 있다. */
  onSelect?: () => void;
  /** 누르기 직전(포인터 진입·터치 시작)에 그 탭의 첫 호출을 미리 읽는다. */
  onPreload?: () => void;
  /** 이름 옆 숫자 칩(알림·댓글 수). 0이면 그리지 않는다. */
  count?: number;
  /** `panels` 탭에서 이 탭이 선택됐을 때 그릴 내용. */
  panel?: ReactNode;
}>;

export function TabLabel({ item }: { item: FanTabItem }) {
  if (!item.count) return <>{item.label}</>;
  return <><span>{item.label}</span><FanCount value={item.count} /></>;
}

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
    // 글꼴이 늦게 오면 탭 폭이 달라진다. 끝 페이드를 다시 판단한다.
    void document.fonts?.ready.then(markMore);
    nav.addEventListener("scroll", markMore, { passive: true });
    let width = nav.clientWidth;
    const stop = () => { nav.removeEventListener("focusin", focus); nav.removeEventListener("scroll", markMore); };
    if (typeof ResizeObserver === "undefined") return stop;
    const observer = new ResizeObserver(() => { markMore(); if (nav.clientWidth === width) return; width = nav.clientWidth; fit(false); });
    observer.observe(nav);
    for (const tab of Array.from(nav.children)) observer.observe(tab);
    return () => { observer.disconnect(); stop(); };
  }, [current]);
  return ref;
}

/** 상태 탭(Base UI Tabs)은 쓰는 화면에서만 불러온다. 서버 렌더는 그대로 해서 첫 화면 자리는 같다. */
const FanPanelTabs = dynamic(() => import("./fan-tabs-panels").then((module) => module.FanPanelTabs));

/** 페이지 탭(`underline`), 필터(`chip`), 한 틀 안 2~3칸(`segment`). 누른 탭은 응답을 기다리지 않고 바로 선택 모양이 되고, 링크 탭은 스크롤을 건드리지 않는다.
 * `panels`를 켜면 링크가 아닌 상태 탭이 된다: role=tablist/tab/tabpanel, ←→ 키로 이동(Base UI Tabs), 선택 탭의 `panel`을 그린다. */
export function FanTabs({ variant = "underline", label, current, items, id, className, panels = false, sticky }: Readonly<{
  variant?: "underline" | "chip" | "segment";
  label: string;
  current: string;
  items: readonly FanTabItem[];
  id?: string;
  className?: string;
  panels?: boolean;
  /** 페이지 탭(underline)은 기본으로 헤더 아래에 붙는다(5차 R3). 카드 안 탭은 false. */
  sticky?: boolean;
}>) {
  const stuck = sticky ?? (variant === "underline" && !panels);
  const cls = [stuck ? styles.sticky : "", className ?? ""].filter(Boolean).join(" ") || undefined;
  if (panels) return <FanPanelTabs variant={variant} label={label} current={current} items={items} id={id} className={cls} />;
  return <FanNavTabs variant={variant} label={label} current={current} items={items} id={id} className={cls} />;
}

function FanNavTabs({ variant, label, current, items, id, className }: Readonly<{
  variant: "underline" | "chip" | "segment";
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
  return <nav id={id} ref={ref} className={cls} aria-label={label} data-fan-tabs={variant} data-items={items.length}>
    {items.map((item) => {
      const preload = item.onPreload ? { onPointerEnter: item.onPreload, onTouchStart: item.onPreload } : {};
      return item.href
        ? <Link key={item.key} className={styles.tab} href={item.href as Route} scroll={false} aria-current={selected === item.key ? "page" : undefined} onNavigate={() => choose(item)} {...preload}><TabLabel item={item} /></Link>
        : <button key={item.key} type="button" className={styles.tab} aria-pressed={selected === item.key} onClick={() => choose(item)} {...preload}><TabLabel item={item} /></button>;
    })}
  </nav>;
}
