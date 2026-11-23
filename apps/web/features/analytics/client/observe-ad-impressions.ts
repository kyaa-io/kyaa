import { decorateOutboundUrl } from "../domain/outbound-link";
import { advertiserForBanner } from "../domain/banner-ad";
import { recordProductEventV1 } from "./product-event-client";

export function observeAdImpressions(doc: Document) {
  const observed = new Map<Element, { visible: boolean; timer?: number }>();
  const seen = new Set<string>();
  function schedule(node: Element) {
    const state = observed.get(node);
    if (!state) return;
    window.clearTimeout(state.timer);
    if (!state.visible || doc.hidden) return;
    state.timer = window.setTimeout(() => {
      const adId = node.getAttribute("data-ad-banner") ?? "";
      const advertiser = advertiserForBanner(adId);
      if (!advertiser || !node.isConnected || doc.hidden || seen.has(adId)) return;
      const anchor = node.querySelector<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.hasAttribute("download") || anchor.closest('[data-outbound-tracking="off"]')
        || !decorateOutboundUrl(anchor.href, doc.location.origin, { campaign: "kyaa", placement: "content", linkKind: "external" })) return;
      const key = 'ad-view:' + adId;
      try { if (sessionStorage.getItem(key)) return; } catch { /* memory fallback */ }
      seen.add(adId);
      void recordProductEventV1({ eventName: "ad_impression", source: "web.outbound", idempotencyKey: "ad-view:" + crypto.randomUUID(),
        celebrityId: null, liveEventId: null, benefitId: null, missionId: null, properties: { adId, advertiser } }).then(ok => {
        if (!ok) { seen.delete(adId); return; }
        try { sessionStorage.setItem(key, "1"); } catch { /* memory fallback */ }
      });
    }, 1000);
  }
  const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(entries => {
    for (const entry of entries) {
      const state = observed.get(entry.target);
      if (!state) continue;
      state.visible = entry.isIntersecting && entry.intersectionRatio >= 0.5;
      schedule(entry.target);
    }
  }, { threshold: 0.5 });
  const visibility = () => observed.forEach((_, node) => schedule(node));
  doc.addEventListener("visibilitychange", visibility);
  return {
    scan() {
      for (const [node, state] of observed) if (!node.isConnected) {
        window.clearTimeout(state.timer);
        observer?.unobserve(node);
        observed.delete(node);
      }
      doc.querySelectorAll("[data-ad-banner]").forEach(node => {
        if (observed.has(node)) return;
        observed.set(node, { visible: false });
        observer?.observe(node);
      });
    },
    stop() {
      observer?.disconnect();
      doc.removeEventListener("visibilitychange", visibility);
      observed.forEach(state => window.clearTimeout(state.timer));
    },
  };
}
