"use client";

import { useByUsAuth as usePrivy } from "@/features/auth/client/cognito-auth";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { useByUsSession } from "@/components/byus-session-provider";
import { recordProductEventV1 } from "./product-event-client";
import { earlyRaffleLanding, readOrCaptureTouch, recordAnonymousLanding, storeTouch } from "./early-raffle-landing";

export function AcquisitionSessionTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { ready, authenticated, getAccessToken, user } = usePrivy();
  const session = useByUsSession();
  const identifiedReady = ready && session.ready && authenticated;
  const ownerId = session.ownerId ?? user?.id ?? null;

  useEffect(() => {
    let cancelled = false;
    const initialTouch = readOrCaptureTouch(pathname, searchParams);
    if (!ready || !initialTouch) return;

    void (async () => {
      if (earlyRaffleLanding) await earlyRaffleLanding;
      if (cancelled) return;
      const touch = readOrCaptureTouch(pathname, searchParams);
      if (!touch) return;
      if (identifiedReady) {
        if (touch.identifiedRecorded) return;
        const token = await getAccessToken();
        if (cancelled || !token || !ownerId) return;
        const recorded = await recordProductEventV1(
          {
            eventName: "creator_page_view",
            celebrityId: null,
            liveEventId: null,
            missionId: null,
            benefitId: null,
            source: touch.anonymousRecorded
              ? "acquisition.identified_handoff"
              : "acquisition.session_landing",
            idempotencyKey: `acquisition:identified:${touch.eventNonce}`,
            occurredAt: touch.occurredAt,
            properties: {
              ...touch.signupSource,
              ...(touch.kol && { kol: touch.kol }),
              channel: touch.channel,
              landing: touch.landing,
              attribution: "session_first_touch",
            },
          },
          token,
        );
        if (!cancelled && recorded) storeTouch({ ...touch, identifiedRecorded: true });
        return;
      }

      await recordAnonymousLanding(touch);
    })().catch(() => undefined);
    return () => { cancelled = true; };
  }, [getAccessToken, identifiedReady, ownerId, pathname, ready, searchParams, session.generation]);

  return null;
}
