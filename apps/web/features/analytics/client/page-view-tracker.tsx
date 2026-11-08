"use client";

import { useByUsAuth } from "@/features/auth/client/cognito-auth";
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

/**
 * One page_view per screen (pathname change); query-only changes such as ?tab= are not new screens. Signed in, the view
 * belongs to the member; signed out, to the anonymous tab session. The entry flag lives in sessionStorage and survives
 * signing in, so a tab is one visit (its single entry=true view) even when it signs in midway.
 */
export function PageViewTracker() {
  const pathname = usePathname();
  const { ready, authenticated, getAccessToken } = useByUsAuth();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    // Wait for the session so a signed-in screen is not recorded as anonymous first.
    if (!ready || !pathname || lastPath.current === pathname) return;
    lastPath.current = pathname;
    if (!pageKindForPath(pathname)) return;
    const properties = pageViewProperties(pathname, claimEntry());
    if (!properties) return;
    const idempotencyKey = `page-view:${crypto.randomUUID()}`;
    void (async () => {
      const token = authenticated ? await getAccessToken().catch(() => null) : null;
      await recordProductEventV1({
        eventName: "page_view",
        celebrityId: null,
        liveEventId: null,
        missionId: null,
        benefitId: null,
        source: "web.page_view",
        idempotencyKey,
        properties,
      }, token);
    })();
  }, [pathname, ready, authenticated, getAccessToken]);

  return null;
}
