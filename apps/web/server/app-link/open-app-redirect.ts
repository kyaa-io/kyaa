import { readKyaaStoreLinks, resolveAppLinkDestination } from "./destination-core";

const LOCAL_ORIGIN = "https://byus.local";
const CARRIED_KEYS = ["locale", "utm_source", "utm_medium", "utm_campaign", "utm_content"] as const;
const CARRIED_VALUE = /^[\p{L}\p{N}._~-]{1,100}$/u;

/** The native app counts as released only when the server flag is on and at least one store link is set. */
export function isNativeAppAvailable(environment: Readonly<Record<string, string | undefined>> = process.env): boolean {
  if (environment.NATIVE_APP_AVAILABLE !== "true") return false;
  const stores = readKyaaStoreLinks(environment);
  return Boolean(stores.apple || stores.google);
}

/**
 * Same-origin web path for an `/open-app` request made before the app exists.
 * Only a destination the app-link rules accept is followed; anything else goes home.
 * The destination keeps its own query and hash. Outer locale and UTM values are added only when missing.
 */
export function openAppWebPath(search: URLSearchParams | string): string {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const returnTo = params.getAll("returnTo");
  const destination = resolveAppLinkDestination(returnTo.length === 1 ? returnTo[0] : null);
  const target = new URL(destination.valid ? (destination.webReturnTo ?? destination.returnTo) : "/", LOCAL_ORIGIN);
  for (const key of CARRIED_KEYS) {
    const values = params.getAll(key);
    if (values.length === 1 && CARRIED_VALUE.test(values[0]) && !target.searchParams.has(key)
      && (key !== "locale" || resolveAppLinkDestination(`/?locale=${encodeURIComponent(values[0])}`).valid)) {
      target.searchParams.set(key, values[0]);
    }
  }
  return `${target.pathname}${target.search}${target.hash}`;
}
