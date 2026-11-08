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
 * only; ads storage, signals and personalization stay off.
 *
 * The Google tag of a stream sends one page_view by itself when it starts, and ignores `send_page_view: false` from a
 * config call (verified on a bare snippet against both kyaa streams). That hit reads the address, title and referrer
 * from the global `set` values, never from config. So the first screen is not sent by hand: its normalized address,
 * screen kind and external referrer are set before `js`, and gtag sends it exactly once. Returns true then. It returns
 * false (nothing started) for a screen that is not measured, and false when gtag is already running, so the caller
 * sends the page_view by hand.
 */
export function startGa4(measurementId: string, pathname: string): boolean {
  if (active?.id === measurementId && active.granted) return false;
  const page = ga4PageLocation(window.location.origin, pathname);
  if (!page) return false;
  window.gtag = window.gtag ?? gtag;
  if (document.getElementById(SCRIPT_ID)) {
    // Allowed again after a refusal: gtag has already started, so only consent changes and the caller sends the screen.
    setDisabled(measurementId, false);
    window.gtag("consent", "update", { analytics_storage: "granted" });
    active = { id: measurementId, granted: true };
    return false;
  }
  window.gtag("consent", "default", {
    analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", wait_for_update: 500,
  });
  window.gtag("consent", "update", { analytics_storage: "granted" });
  const referrer = referrerSent ? "" : ga4PageReferrer(document.referrer, window.location.origin);
  referrerSent = true;
  window.gtag("set", { page_location: page.location, page_referrer: referrer, page_title: page.kind });
  window.gtag("js", new Date());
  window.gtag("config", measurementId, {
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });
  const script = document.createElement("script");
  script.id = SCRIPT_ID;
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(script);
  active = { id: measurementId, granted: true };
  return true;
}

function setDisabled(measurementId: string, disabled: boolean): void {
  (window as unknown as Record<string, unknown>)[`ga-disable-${measurementId}`] = disabled;
}

/**
 * After a refusal nothing more is sent; GA cookies on this site are removed. Consent mode alone still lets the tag send
 * cookieless pings (user_engagement, scroll) when the page is left, so the stream is also switched off with Google's
 * `ga-disable-<ID>` flag until the visitor allows it again.
 */
export function stopGa4(): void {
  if (active) {
    window.gtag?.("consent", "update", { analytics_storage: "denied" });
    setDisabled(active.id, true);
  }
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

/** A page_view by hand for every screen after the first one (the first is sent by gtag, see startGa4). */
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
