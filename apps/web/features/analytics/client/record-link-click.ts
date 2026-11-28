import { advertiserForBanner } from "../domain/banner-ad";
import type { OutboundProperties } from "../domain/outbound-link";
import { recordProductEventV1 } from "./product-event-client";

/** Use the existing click event so registered ads keep their reporting history. */
export function recordLinkClick(properties: OutboundProperties, adId?: string) {
  try {
    const advertiser = adId && advertiserForBanner(adId);
    void recordProductEventV1({
      eventName: "outbound_link_click", source: "web.outbound", idempotencyKey: `outbound:${crypto.randomUUID()}`,
      celebrityId: null, liveEventId: null, missionId: null, benefitId: null,
      properties: advertiser && adId ? { ...properties, adId, advertiser } : properties,
    });
  } catch { /* Analytics must never prevent navigation. */ }
}
