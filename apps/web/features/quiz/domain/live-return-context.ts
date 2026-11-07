import { creatorSlugFromHomePath } from "@/features/creator/domain/creator-navigation";
import { isAppLocale } from "@/i18n/locales";
const LIVE_PATH = /^\/live\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RAFFLE_PATH = /^\/c\/[a-z0-9]+(?:-[a-z0-9]+)*\/raffles(?:\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})?$/i;
const GROUP_PAGE_PATH = /^\/pages\/groups\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAGE_TAB_KEYS = new Set(["tab", "post", "section", "source", "room"]);
const PAGE_TAB_VALUE = /^[A-Za-z0-9-]{1,64}$/;
const RESERVED_LIVE_SLUGS = new Set(["calendar"]);
const AUTH_INTENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const LOCAL_ORIGIN = "https://byus.local";

/**
 * Accepts canonical LIVE detail, creator raffle and fan page routes to resume what the fan was doing after
 * fan verification. Other internal paths are intentionally rejected so a verification or issuance route
 * cannot redirect back into itself.
 */
export function sanitizeLiveReturnTo(value: string | null | undefined): string | null {
  if (
    !value
    || value.length > 256
    || !value.startsWith("/")
    || value.startsWith("//")
    || value.includes("\\")
    || CONTROL_CHARACTER.test(value)
  ) {
    return null;
  }

  try {
    const parsed = new URL(value, LOCAL_ORIGIN);
    if (
      parsed.origin !== LOCAL_ORIGIN
      || parsed.username
      || parsed.password
      || parsed.hash
      || (!LIVE_PATH.test(parsed.pathname) && !RAFFLE_PATH.test(parsed.pathname) && !isFanPagePath(parsed.pathname))
      || parsed.pathname.length > 128
      || RESERVED_LIVE_SLUGS.has(parsed.pathname.slice("/live/".length))
    ) {
      return null;
    }

    const keys = [...parsed.searchParams.keys()];
    const page = isFanPagePath(parsed.pathname);
    if (keys.some((key) => key !== "locale" && key !== "authIntent" && !(page && PAGE_TAB_KEYS.has(key)))) return null;

    const locales = parsed.searchParams.getAll("locale");
    if (locales.length !== 1 || !isAppLocale(locales[0])) return null;

    const authIntents = parsed.searchParams.getAll("authIntent");
    if (authIntents.length > 1 || (authIntents[0] && !AUTH_INTENT_ID.test(authIntents[0]))) return null;

    const query = new URLSearchParams({ locale: locales[0] });
    if (authIntents[0]) query.set("authIntent", authIntents[0].toLowerCase());
    if (page) for (const key of PAGE_TAB_KEYS) {
      const values = parsed.searchParams.getAll(key);
      if (values.length > 1 || (values[0] && !PAGE_TAB_VALUE.test(values[0]))) return null;
      if (values[0]) query.set(key, values[0]);
    }
    return `${parsed.pathname}?${query.toString()}`;
  } catch {
    return null;
  }
}

function isFanPagePath(pathname: string) {
  return GROUP_PAGE_PATH.test(pathname) || creatorSlugFromHomePath(pathname) !== null;
}

/** The entry check of a creator, coming back to `returnTo` when that is a place the check may return to. */
export function fanVerifyHref(slug: string, locale: string, returnTo?: string | null): string {
  return appendLiveReturnTo(`/c/${encodeURIComponent(slug)}/verify?locale=${locale}`, returnTo);
}

/** The current fan page address reduced to what the return path accepts, so a sort or cursor in the address cannot lose the way back. */
export function fanPageReturnPath(pathname: string, search: string, locale: string): string {
  const current = new URLSearchParams(search), next = new URLSearchParams({ locale });
  for (const key of PAGE_TAB_KEYS) { const value = current.get(key); if (value) next.set(key, value); }
  return `${pathname}?${next}`;
}

export function appendLiveReturnTo(path: string, returnTo: string | null | undefined): string {
  const safeReturnTo = sanitizeLiveReturnTo(returnTo);
  if (!safeReturnTo) return path;

  const parsed = new URL(path, LOCAL_ORIGIN);
  parsed.searchParams.set("returnTo", safeReturnTo);
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
