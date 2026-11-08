import { ga4PageLocation, ga4PageReferrer, ga4Payload, type Ga4Parameters } from "../domain/ga4";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const SCRIPT_ID = "kyaa-ga4";
let active: { id: string; granted: boolean } | null = null;
let referrerSent = false;

function gtag(...args: unknown[]): void {
  window.dataLayer = window.dataLayer ?? [];
  // gtag.js reads the arguments object itself, as Google's snippet pushes it.
  window.dataLayer.push(arguments);
  void args;
}

/**
 * Loads gtag.js once, only after the visitor allowed it. Consent starts denied and is updated to granted for analytics
 * only; ads storage, signals and personalization stay off. Automatic page views are off: page_view is sent by hand.
 */
export function startGa4(measurementId: string): void {
  if (active?.id === measurementId && active.granted) return;
  window.gtag = window.gtag ?? gtag;
  window.gtag("consent", "default", {
    analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", wait_for_update: 500,
  });
  window.gtag("consent", "update", { analytics_storage: "granted" });
  window.gtag("js", new Date());
  window.gtag("config", measurementId, {
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    page_location: `${window.location.origin}/`,
    page_referrer: "",
  });
  if (!document.getElementById(SCRIPT_ID)) {
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    document.head.appendChild(script);
  }
  active = { id: measurementId, granted: true };
}

/** After a refusal nothing more is sent; GA cookies on this site are removed. */
export function stopGa4(): void {
  if (active) window.gtag?.("consent", "update", { analytics_storage: "denied" });
  active = active ? { ...active, granted: false } : null;
  for (const name of document.cookie.split(";").map((part) => part.split("=")[0]?.trim() ?? "")) {
    if (name === "_ga" || name.startsWith("_ga_")) {
      document.cookie = `${name}=; Max-Age=0; path=/`;
      document.cookie = `${name}=; Max-Age=0; path=/; domain=.${window.location.hostname.replace(/^www\./, "")}`;
    }
  }
}

export function ga4Active(): boolean {
  return Boolean(active?.granted && window.gtag);
}

/** Funnel events: silently nothing without consent, and nothing outside the parameter allowlist. */
export function sendGa4Event(name: string, parameters: Ga4Parameters = {}): void {
  if (!ga4Active()) return;
  const payload = ga4Payload(name, parameters);
  if (!payload || payload.name === "page_view") return;
  window.gtag!("event", payload.name, payload.parameters);
}

/** One page_view per screen with the normalized address; the external referrer goes with the first one only. */
export function sendGa4PageView(pathname: string): boolean {
  if (!ga4Active()) return false;
  const page = ga4PageLocation(window.location.origin, pathname);
  if (!page) return false;
  const referrer = referrerSent ? "" : ga4PageReferrer(document.referrer, window.location.origin);
  referrerSent = true;
  const parameters = { page_location: page.location, page_referrer: referrer, page_title: page.kind };
  if (!ga4Payload("page_view", parameters)) return false;
  // Later events carry the same normalized page, never the raw URL or title.
  window.gtag!("set", parameters);
  window.gtag!("event", "page_view", parameters);
  return true;
}

export function resetGa4ForTests(): void {
  active = null;
  referrerSent = false;
}
