import type { AppLocale } from "@/i18n/locales";
import { translate } from "@/i18n/messages";
import { analyticsConsentSource, messages } from "@/i18n/catalogs/features__analytics__client__analytics-consent";

/** The visitor's GA4 choice: kept in this browser for one year, never tied to an account. */
export type AnalyticsConsent = "granted" | "denied";

const STORAGE_KEY = "kyaa.analytics-consent.v1";
export const ANALYTICS_CONSENT_TTL_MS = 365 * 24 * 60 * 60_000;
const CHANGE_EVENT = "kyaa:analytics-consent";
const OPEN_EVENT = "kyaa:analytics-consent-open";

export function readAnalyticsConsent(now = Date.now()): AnalyticsConsent | null {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as { choice?: unknown; at?: unknown } | null;
    if (!parsed || (parsed.choice !== "granted" && parsed.choice !== "denied") || typeof parsed.at !== "number") return null;
    if (parsed.at > now + 60_000 || now - parsed.at > ANALYTICS_CONSENT_TTL_MS) return null;
    return parsed.choice;
  } catch {
    return null;
  }
}

export function writeAnalyticsConsent(choice: AnalyticsConsent, now = Date.now()): void {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ choice, at: now })); } catch { /* the choice still applies to this page */ }
  window.dispatchEvent(new CustomEvent<AnalyticsConsent>(CHANGE_EVENT, { detail: choice }));
}

export function onAnalyticsConsentChange(listener: (choice: AnalyticsConsent) => void): () => void {
  const handler = (event: Event) => listener((event as CustomEvent<AnalyticsConsent>).detail);
  window.addEventListener(CHANGE_EVENT, handler);
  return () => window.removeEventListener(CHANGE_EVENT, handler);
}

/** Shows the consent bar again so the visitor can change an earlier choice (footer link). */
export function openAnalyticsConsent(): void {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function onAnalyticsConsentOpen(listener: () => void): () => void {
  window.addEventListener(OPEN_EVENT, listener);
  return () => window.removeEventListener(OPEN_EVENT, listener);
}

// Whether this deployment has a GA4 stream at all; without one nothing about analytics consent is shown.
let available = false;
const availabilityListeners = new Set<(value: boolean) => void>();
export function setAnalyticsConsentAvailable(value: boolean): void {
  available = value;
  availabilityListeners.forEach((listener) => listener(value));
}
export function analyticsConsentAvailable(): boolean { return available; }
export function onAnalyticsConsentAvailability(listener: (value: boolean) => void): () => void {
  availabilityListeners.add(listener);
  return () => { availabilityListeners.delete(listener); };
}

export function analyticsConsentText(locale: AppLocale, field: keyof typeof analyticsConsentSource): string {
  const source = analyticsConsentSource[field];
  return locale === "ko" ? source.ko : translate(locale, messages[source.key], source.en);
}
