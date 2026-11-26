"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import {
  acquisitionLanding,
  acquisitionTouchSchema,
  classifyAcquisitionChannel,
  readStoredAcquisitionTouch,
  type AcquisitionTouch,
} from "../domain/acquisition-attribution";
import { captureSignupSource } from "../domain/signup-source";
import { recordProductEventV1 } from "./product-event-client";

const STORAGE_KEY = "byus.acquisition.session.v1";
const ENTRY_EVALUATED_KEY = "byus.acquisition.entry-evaluated.v1";

export function storeTouch(touch: AcquisitionTouch): void {
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(acquisitionTouchSchema.parse(touch)));
}

export function readOrCaptureTouch(pathname: string, searchParams: Pick<URLSearchParams, "get" | "has">) {
  let touch: AcquisitionTouch | null;
  try {
    touch = readStoredAcquisitionTouch(window.sessionStorage.getItem(STORAGE_KEY));
    if (!touch) {
      if (window.sessionStorage.getItem(ENTRY_EVALUATED_KEY)) return null;
      window.sessionStorage.setItem(ENTRY_EVALUATED_KEY, "1");
      const landing = acquisitionLanding(pathname);
      if (!landing) return null;
      touch = {
        signupSource: captureSignupSource(pathname, searchParams, document.referrer),
        channel: classifyAcquisitionChannel({
          searchParams,
          referrer: document.referrer,
          siteOrigin: window.location.origin,
        }),
        landing,
        anonymousRecorded: false,
        identifiedRecorded: false,
        eventNonce: window.crypto.randomUUID(),
        occurredAt: new Date().toISOString(),
      };
      storeTouch(touch);
    }
  } catch {
    return null;
  }
  return touch;
}

export async function recordAnonymousLanding(touch: AcquisitionTouch) {
  if (touch.anonymousRecorded) return;
  const recorded = await recordProductEventV1({
    eventName: "creator_page_view",
    celebrityId: null,
    liveEventId: null,
    missionId: null,
    benefitId: null,
    source: "acquisition.session_landing",
    idempotencyKey: `acquisition:anonymous:${touch.eventNonce}`,
    occurredAt: touch.occurredAt,
    properties: {
      channel: touch.channel,
      landing: touch.landing,
      attribution: "session_first_touch",
    },
  });
  if (recorded) storeTouch({ ...touch, anonymousRecorded: true });
}

export let earlyRaffleLanding: Promise<void> | undefined;

export function EarlyRaffleLandingTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  useEffect(() => {
    if (!/^\/s\/raffle\/?$/.test(pathname) || earlyRaffleLanding) return;
    const touch = readOrCaptureTouch(pathname, searchParams);
    if (touch) earlyRaffleLanding = recordAnonymousLanding(touch).catch(() => undefined);
  }, [pathname, searchParams]);
  return null;
}
