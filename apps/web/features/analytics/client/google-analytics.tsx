"use client";

import { FanAction } from "@/components/fan-ui/fan-action";
import { usePageLocale } from "@/components/locale-provider";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { readGa4MeasurementId } from "../domain/ga4";
import {
  analyticsConsentText,
  onAnalyticsConsentChange,
  onAnalyticsConsentOpen,
  readAnalyticsConsent,
  setAnalyticsConsentAvailable,
  writeAnalyticsConsent,
  type AnalyticsConsent,
} from "./analytics-consent";
import { sendGa4PageView, startGa4, stopGa4 } from "./ga4-client";
import styles from "./google-analytics.module.css";

const staffPath = /^\/(?:admin|operator)(?:\/|$)/;

/**
 * GA4 for the stream configured on this deployment (GA4_MEASUREMENT_ID at runtime). Without an ID nothing renders and
 * nothing loads. With one, gtag.js loads only after the visitor allows it; until then, or after a refusal, no request
 * goes to Google. Page views are sent by hand once per screen.
 */
export function GoogleAnalytics({ measurementId }: { measurementId: string }) {
  const id = readGa4MeasurementId(measurementId);
  const pathname = usePathname();
  const [choice, setChoice] = useState<AnalyticsConsent | null | "unread">("unread");
  const [reopened, setReopened] = useState(false);
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    setAnalyticsConsentAvailable(Boolean(id));
    if (!id) return;
    setChoice(readAnalyticsConsent());
    const offChange = onAnalyticsConsentChange((value) => { setChoice(value); setReopened(false); });
    const offOpen = onAnalyticsConsentOpen(() => setReopened(true));
    return () => { offChange(); offOpen(); setAnalyticsConsentAvailable(false); };
  }, [id]);

  useEffect(() => {
    if (!id || choice === "unread") return;
    if (choice !== "granted") { stopGa4(); lastPath.current = null; return; }
    startGa4(id);
    if (pathname && lastPath.current !== pathname && sendGa4PageView(pathname)) lastPath.current = pathname;
  }, [id, choice, pathname]);

  if (!id || choice === "unread" || (choice !== null && !reopened)) return null;
  if (!reopened && pathname && staffPath.test(pathname)) return null;
  return <ConsentBar onChoose={(value) => writeAnalyticsConsent(value)} />;
}

function ConsentBar({ onChoose }: { onChoose: (choice: AnalyticsConsent) => void }) {
  const locale = usePageLocale();
  const copy = {
    region: analyticsConsentText(locale, "region"), question: analyticsConsentText(locale, "question"),
    policy: analyticsConsentText(locale, "policy"), decline: analyticsConsentText(locale, "decline"), allow: analyticsConsentText(locale, "allow"),
  };
  const privacy = (locale === "ko" ? "/privacy" : `/privacy?locale=${locale}`) as Route;
  return <section className={styles.bar} aria-label={copy.region}>
    <p className={styles.copy}>{copy.question} <Link href={privacy} className={styles.policy}>{copy.policy}</Link></p>
    <div className={styles.actions}>
      <FanAction size="sm" onClick={() => onChoose("denied")}>{copy.decline}</FanAction>
      <FanAction size="sm" onClick={() => onChoose("granted")}>{copy.allow}</FanAction>
    </div>
  </section>;
}
