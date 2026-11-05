import { isAppLocale } from "@/i18n/locales";
import type { SessionStorageAccess } from "@/features/reliability/client/session-storage";

/**
 * Where the fan-verification dialog goes when it is closed. Only set when the
 * dialog was opened from a certification list, so a direct visit keeps the
 * creator-home fallback. Kept apart from `returnTo`, which resumes the flow
 * after passing the quiz.
 */
const KEY = "byus:quiz-close-return";
const FOCUS_KEY = "byus:quiz-focus-return";
const MAX_AGE_MS = 30 * 60 * 1000;
const HANDLE = /^[a-z0-9]+(?:[-_.][a-z0-9]+)*$/i;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const LOCAL_ORIGIN = "https://byus.local";
const TABS = new Set(["certifications"]);

export type QuizCloseReturn = { href: string; itemId: string };

export function sanitizeCertificationListPath(value: string | null | undefined, slug: string): string | null {
  if (!value || value.length > 256 || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || CONTROL_CHARACTER.test(value)) return null;
  try {
    const parsed = new URL(value, LOCAL_ORIGIN);
    if (parsed.origin !== LOCAL_ORIGIN || parsed.hash) return null;
    const path = parsed.pathname;
    const own = slug.toLowerCase();
    const isCommunity = path === "/community"
      && parsed.searchParams.get("creator")?.toLowerCase() === own
      && TABS.has(parsed.searchParams.get("tab") ?? "");
    const isCreatorList = path.toLowerCase() === `/c/${own}/certifications`;
    if (!isCommunity && !isCreatorList) return null;
    const allowed = new Set(["creator", "tab", "locale"]);
    for (const key of parsed.searchParams.keys()) if (!allowed.has(key)) return null;
    const locale = parsed.searchParams.get("locale");
    if (locale && !isAppLocale(locale)) return null;
    for (const key of ["creator", "tab", "locale"]) {
      const value = parsed.searchParams.get(key);
      if (value && (value.length > 32 || !HANDLE.test(value))) return null;
    }
    return `${path}${parsed.search}`;
  } catch {
    return null;
  }
}

export function rememberQuizCloseReturn(storage: SessionStorageAccess, slug: string, href: string, itemId: string, now = Date.now()) {
  const safe = sanitizeCertificationListPath(href, slug);
  if (!safe) return;
  try { storage.setItem(KEY, JSON.stringify({ slug: slug.toLowerCase(), href: safe, itemId, at: now })); } catch { /* optional convenience */ }
}

export function readQuizCloseReturn(storage: SessionStorageAccess, slug: string, now = Date.now()): QuizCloseReturn | null {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as { slug?: unknown; href?: unknown; itemId?: unknown; at?: unknown };
    if (value.slug !== slug.toLowerCase() || typeof value.at !== "number" || now - value.at > MAX_AGE_MS || now < value.at) return null;
    const href = sanitizeCertificationListPath(typeof value.href === "string" ? value.href : null, slug);
    if (!href || typeof value.itemId !== "string" || value.itemId.length > 64) return null;
    return { href, itemId: value.itemId };
  } catch {
    return null;
  }
}

/** The dialog takes the origin once when it opens: a later direct visit never inherits a stale list click. */
export function takeQuizCloseReturn(storage: SessionStorageAccess, slug: string): QuizCloseReturn | null {
  const value = readQuizCloseReturn(storage, slug);
  try { storage.removeItem(KEY); } catch { /* optional */ }
  return value;
}

/** Written only when the dialog closes back to the list, so the list can focus the card that opened it. */
export function rememberQuizFocusReturn(storage: SessionStorageAccess, slug: string, itemId: string, now = Date.now()) {
  try { storage.setItem(FOCUS_KEY, JSON.stringify({ slug: slug.toLowerCase(), itemId, at: now })); } catch { /* optional convenience */ }
}

/** The list reads the item id once after it mounts to put focus back on the card link. */
export function takeQuizFocusReturn(storage: SessionStorageAccess, slug: string, now = Date.now()): string | null {
  try {
    const raw = storage.getItem(FOCUS_KEY);
    if (!raw) return null;
    storage.removeItem(FOCUS_KEY);
    const value = JSON.parse(raw) as { slug?: unknown; itemId?: unknown; at?: unknown };
    if (value.slug !== slug.toLowerCase() || typeof value.at !== "number" || now - value.at > MAX_AGE_MS || now < value.at) return null;
    return typeof value.itemId === "string" && value.itemId.length <= 64 ? value.itemId : null;
  } catch {
    return null;
  }
}
