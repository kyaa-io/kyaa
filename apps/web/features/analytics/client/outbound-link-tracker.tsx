"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { decorateOutboundUrl, outboundCampaign, outboundKindSchema, outboundPlacementSchema, outboundTrackingAllowed } from "../domain/outbound-link";
import { recordProductEventV1 } from "./product-event-client";

const REACT_FIBER = "__reactFiber$", REACT_PROPS = "__reactProps$";
const ownKey = (node: Element, prefix: string) => Object.keys(node).find((key) => key.startsWith(prefix));

/**
 * Has React finished hydrating the part of the page this anchor belongs to? Changing an attribute of server HTML that React has not
 * hydrated yet makes React report a hydration mismatch (feedback F5: the footer links under a Suspense boundary). Walking up, the first
 * element React owns decides: the anchor itself, or a `dangerouslySetInnerHTML` container (rich text: React never owns its children),
 * means hydrated; any other owned ancestor above unowned elements means the subtree is still server HTML. No owned element at all
 * (DOM that React does not manage) counts as ready.
 */
export function anchorHydrated(anchor: HTMLAnchorElement) {
  for (let node: Element | null = anchor; node; node = node.parentElement) {
    if (!ownKey(node, REACT_FIBER)) continue;
    if (node === anchor) return true;
    const propsKey = ownKey(node, REACT_PROPS);
    return Boolean(propsKey && (node as unknown as Record<string, { dangerouslySetInnerHTML?: unknown } | undefined>)[propsKey]?.dangerouslySetInnerHTML);
  }
  return true;
}

const PENDING_RETRY_MS = 250, PENDING_LIMIT_MS = 30_000;

export function trackOutboundLinks(root: Document, pathname: string) {
  if (!outboundTrackingAllowed(pathname)) return () => {};
  const owned = new Map<HTMLAnchorElement, { original: string; decorated: string }>();
  // Anchors whose subtree React has not hydrated yet: their href is left as the server drew it and tried again shortly.
  const pending = new Set<HTMLAnchorElement>();
  let retry: number | undefined; const startedAt = Date.now();
  const retryPending = () => {
    retry = undefined;
    for (const anchor of [...pending]) { pending.delete(anchor); if (anchor.isConnected) decorate(anchor); }
    if (pending.size && Date.now() - startedAt < PENDING_LIMIT_MS) retry = window.setTimeout(retryPending, PENDING_RETRY_MS);
  };
  function decorate(anchor: HTMLAnchorElement) {
    const href = anchor.getAttribute("href");
    if (href === null) return null;
    const previous = owned.get(anchor);
    const original = href === previous?.decorated ? previous.original : href;
    if (anchor.hasAttribute("download") || anchor.closest('[data-outbound-tracking="off"]')) {
      if (href === previous?.decorated) anchor.setAttribute("href", previous.original);
      owned.delete(anchor);
      return null;
    }
    const marker = root.querySelector<HTMLElement>("[data-outbound-campaign]");
    const placement = outboundPlacementSchema.safeParse(anchor.closest<HTMLElement>("[data-outbound-placement]")?.dataset.outboundPlacement);
    const kind = outboundKindSchema.safeParse(anchor.closest<HTMLElement>("[data-outbound-kind]")?.dataset.outboundKind);
    const result = decorateOutboundUrl(original, root.location.origin, {
      campaign: outboundCampaign(pathname, marker?.dataset.outboundCampaign),
      placement: placement.success ? placement.data : anchor.closest("footer") ? "footer" : anchor.closest("header") ? "header" : "content",
      linkKind: kind.success ? kind.data : anchor.hasAttribute("data-platform") ? "social" : "external",
    });
    if (!result) { owned.delete(anchor); return null; }
    if (href !== result.href) {
      if (!anchorHydrated(anchor)) {
        // Measure the click, but do not touch server HTML React still has to hydrate; try again once it has.
        pending.add(anchor);
        if (retry === undefined) retry = window.setTimeout(retryPending, PENDING_RETRY_MS);
        return result;
      }
      anchor.setAttribute("href", result.href);
    }
    owned.set(anchor, { original, decorated: result.href });
    return result;
  }
  const scan = () => root.querySelectorAll<HTMLAnchorElement>("a[href]").forEach(decorate);
  scan();
  const observer = new MutationObserver(scan);
  observer.observe(root.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["href", "download", "data-outbound-campaign", "data-outbound-placement", "data-outbound-kind", "data-outbound-tracking"] });
  function click(event: MouseEvent) {
    if (event.defaultPrevented || (event.type === "auxclick" ? event.button !== 1 : event.button !== 0)) return;
    const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
    if (!anchor) return;
    const result = decorate(anchor);
    if (!result) return;
    try {
      // No awaited identity lookup: keepalive starts before same-tab navigation.
      void recordProductEventV1({ eventName: "outbound_link_click", source: "web.outbound", idempotencyKey: `outbound:${crypto.randomUUID()}`,
        celebrityId: null, liveEventId: null, missionId: null, benefitId: null, properties: result.properties });
    } catch { /* Analytics must never prevent navigation. */ }
  }
  root.addEventListener("click", click);
  root.addEventListener("auxclick", click);
  return () => {
    if (retry !== undefined) window.clearTimeout(retry);
    pending.clear();
    observer.disconnect();
    root.removeEventListener("click", click);
    root.removeEventListener("auxclick", click);
    for (const [anchor, value] of owned) if (anchor.getAttribute("href") === value.decorated) anchor.setAttribute("href", value.original);
  };
}

let documentSettled = false;

/** Resolves once the first page has loaded and the browser is idle, or at the first pointer, key or context-menu input. */
function whenDocumentSettled(run: () => void) {
  if (documentSettled) { run(); return () => {}; }
  let done = false, idle: number | undefined;
  const inputs = ["pointerdown", "keydown", "contextmenu"] as const;
  const finish = () => {
    if (done) return;
    done = true; documentSettled = true; cleanup(); run();
  };
  const afterLoad = () => { idle = typeof window.requestIdleCallback === "function" ? window.requestIdleCallback(finish, { timeout: 2000 }) : window.setTimeout(finish, 200); };
  function cleanup() {
    window.removeEventListener("load", afterLoad);
    for (const type of inputs) document.removeEventListener(type, finish, true);
    if (idle !== undefined) { if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idle); else window.clearTimeout(idle); }
  }
  for (const type of inputs) document.addEventListener(type, finish, true);
  if (document.readyState === "complete") afterLoad(); else window.addEventListener("load", afterLoad);
  return () => { done = true; cleanup(); };
}

export function OutboundLinkTracker() {
  const pathname = usePathname();
  // Rewriting hrefs while a Suspense boundary (the footer) is still hydrating makes React report a hydration mismatch, so the first start
  // waits for the loaded, idle page or the first input (which comes before the click it must record). Later routes start at once.
  useEffect(() => {
    let stop: (() => void) | undefined;
    const cancel = whenDocumentSettled(() => { stop = trackOutboundLinks(document, pathname); });
    return () => { cancel(); stop?.(); };
  }, [pathname]);
  return null;
}
