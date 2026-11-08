"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { classifyAcquisitionChannel } from "../domain/acquisition-attribution";
import { deviceContext, pageKindForPath, type PageViewProperties } from "../domain/funnel-event";
import { recordProductEventV1 } from "./product-event-client";

const ENTRY_KEY = "byus.page-view.entry.v1";

/** First screen of this tab session: claims the flag so later screens are internal. */
function claimEntry(): boolean {
  try {
    if (window.sessionStorage.getItem(ENTRY_KEY)) return false;
    window.sessionStorage.setItem(ENTRY_KEY, "1");
    return true;
  } catch {
    return false;
  }
}

export function pageViewProperties(pathname: string, entry: boolean): PageViewProperties | null {
  const pageKind = pageKindForPath(pathname);
  if (!pageKind) return null;
  return {
    pageKind,
    entry,
    channel: entry ? classifyAcquisitionChannel({
      searchParams: new URLSearchParams(window.location.search),
      referrer: document.referrer,
      siteOrigin: window.location.origin,
    }) : "internal",
    ...deviceContext(navigator.userAgent),
  };
}

/** One anonymous page_view per screen (pathname change). Query-only changes such as ?tab= are not new screens. */
export function PageViewTracker() {
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || lastPath.current === pathname) return;
    lastPath.current = pathname;
    if (!pageKindForPath(pathname)) return;
    const properties = pageViewProperties(pathname, claimEntry());
    if (!properties) return;
    void recordProductEventV1({
      eventName: "page_view",
      celebrityId: null,
      liveEventId: null,
      missionId: null,
      benefitId: null,
      source: "web.page_view",
      idempotencyKey: `page-view:${crypto.randomUUID()}`,
      properties,
    });
  }, [pathname]);

  return null;
}
