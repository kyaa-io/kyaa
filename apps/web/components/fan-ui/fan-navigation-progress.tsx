"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import styles from "./fan-navigation-progress.module.css";

/** Shown only when a move takes longer than this; quick moves draw nothing. */
export const NAVIGATION_PROGRESS_DELAY_MS = 300;
/** A move that never reports its end (an error page, a cancelled click) stops showing the bar after this. */
const NAVIGATION_PROGRESS_LIMIT_MS = 15_000;

function internalTarget(event: MouseEvent): URL | null {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const anchor = (event.target as Element | null)?.closest?.("a[href]");
  if (!(anchor instanceof HTMLAnchorElement) || (anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return null;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return null;
  // Only the hash differs: the page does not move.
  if (url.pathname === window.location.pathname && url.search === window.location.search) return null;
  return url;
}

/**
 * 261107-2 r4 (decision after E): screens that now keep the previous page while the next one loads say that something is happening.
 * A 2px bar at the very top appears only when a move takes longer than 300ms, grows while it waits and goes away when the address
 * changes. No blank screen, no skeleton. Reduced motion: a still bar. Decorative (aria-hidden); the new page is the announcement.
 */
export function FanNavigationProgress() {
  const pathname = usePathname(), search = useSearchParams()?.toString() ?? "";
  const [visible, setVisible] = useState(false);
  const timers = useRef<{ show?: number; limit?: number }>({});
  const shown = useRef(""); // the address the screen shows now (path + query)
  const stop = () => { window.clearTimeout(timers.current.show); window.clearTimeout(timers.current.limit); timers.current = {}; setVisible(false); };
  useEffect(() => {
    const start = () => {
      stop();
      timers.current.show = window.setTimeout(() => setVisible(true), NAVIGATION_PROGRESS_DELAY_MS);
      timers.current.limit = window.setTimeout(stop, NAVIGATION_PROGRESS_LIMIT_MS);
    };
    const onClick = (event: MouseEvent) => { if (internalTarget(event)) start(); };
    // Back/forward: only when the path or query really changes (a hash-only step also fires popstate).
    const onPop = () => { if (window.location.pathname + window.location.search !== shown.current) start(); };
    // Capture phase: the router link cancels the browser's own navigation (preventDefault) before a bubbling listener would see it.
    // A move that never starts is cleared by the limit below.
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPop);
    return () => { document.removeEventListener("click", onClick, true); window.removeEventListener("popstate", onPop); stop(); };
  }, []);
  // The address changed: the move finished.
  useEffect(() => { shown.current = pathname + (search ? `?${search}` : ""); stop(); }, [pathname, search]);
  return visible ? <div className={styles.bar} data-fan-navigation-progress="" aria-hidden="true"><span /></div> : null;
}
