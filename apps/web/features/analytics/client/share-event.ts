import type { ShareContentType } from "../domain/funnel-event";
import { recordProductEventV1 } from "./product-event-client";
import { sendGa4Event } from "./ga4-client";

/** Call after navigator.share resolved or the link was copied. Signed-in shares count as a first activity. */
export function recordShareCompleted(
  method: "native" | "copy",
  contentType: ShareContentType,
  getAccessToken?: () => Promise<string | null>,
): void {
  sendGa4Event("share", { method, content_type: contentType });
  void (async () => {
    const token = getAccessToken ? await getAccessToken().catch(() => null) : null;
    await recordProductEventV1({
      eventName: "share_completed",
      celebrityId: null,
      liveEventId: null,
      missionId: null,
      benefitId: null,
      source: "web.share",
      idempotencyKey: `share:${crypto.randomUUID()}:completed`,
      properties: { method, contentType },
    }, token);
  })();
}
