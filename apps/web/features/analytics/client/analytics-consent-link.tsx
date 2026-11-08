"use client";

import { FanAction } from "@/components/fan-ui/fan-action";
import type { AppLocale } from "@/i18n/locales";
import { useEffect, useState } from "react";
import { analyticsConsentAvailable, analyticsConsentText, onAnalyticsConsentAvailability, openAnalyticsConsent } from "./analytics-consent";

/** Footer entry to change the GA4 choice again; only where a GA4 stream is configured. */
export function AnalyticsConsentLink({ locale }: { locale: AppLocale }) {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    setAvailable(analyticsConsentAvailable());
    return onAnalyticsConsentAvailability(setAvailable);
  }, []);
  if (!available) return null;
  return <><span aria-hidden="true">·</span><FanAction variant="text" size="sm" onClick={openAnalyticsConsent}>{analyticsConsentText(locale, "settings")}</FanAction></>;
}
