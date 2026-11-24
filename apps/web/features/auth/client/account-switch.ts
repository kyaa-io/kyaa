"use client";
import { sanitizeReturnTo } from "@/components/login-intent";
import { getSessionStorage } from "@/features/reliability/client/session-storage";
import type { AppLocale } from "@/i18n/locales";

/**
 * Account switch, step 1 (ACCOUNT-SWITCH-S1-1124): the current account signs out and the normal login page opens.
 * Only this tab remembers, for 30 minutes, which account left and which public page to come back to; the result is
 * announced only after the server session names a different member.
 */
const KEY = "kyaa:account-switch";
const SIGNED_OUT_KEY = "kyaa:signed-out-at";
const PENDING_MS = 30 * 60_000;

type PendingSwitch = { from: string; returnTo: string; at: number };

// Paths whose content is someone's own (MY, DM, settings, admin, payment, invitations) or a form in progress.
const PRIVATE_SEGMENTS = new Set(["my", "settings", "notifications", "admin", "operator", "creator", "onboarding", "account-deletion", "connect", "auth", "login", "api", "i", "o", "t", "go", "manage", "edit", "write", "new", "apply", "invite", "invitations", "requests", "wallet", "checkout", "payment", "messages"]);

/** The page the next account lands on: the same public page and language, never someone's private context or query. */
export function publicReturnPath(path: string, locale: AppLocale): string {
  const pathname = new URL(sanitizeReturnTo(path), "https://byus.local").pathname;
  const segments = pathname.split("/").filter(Boolean);
  const safe = segments.every(segment => !PRIVATE_SEGMENTS.has(segment.toLowerCase())) ? pathname : "/";
  return `${safe}?locale=${locale}`;
}

export function beginAccountSwitch(from: string, path: string, locale: AppLocale, now = Date.now()): string {
  const returnTo = publicReturnPath(path, locale);
  getSessionStorage().setItem(KEY, JSON.stringify({ from, returnTo, at: now } satisfies PendingSwitch));
  return returnTo;
}

export function readAccountSwitch(now = Date.now()): PendingSwitch | null {
  try {
    const value: unknown = JSON.parse(getSessionStorage().getItem(KEY) ?? "null");
    if (!value || typeof value !== "object") return null;
    const { from, returnTo, at } = value as Record<string, unknown>;
    if (typeof from !== "string" || typeof returnTo !== "string" || typeof at !== "number" || now - at > PENDING_MS || at > now) { clearAccountSwitch(); return null; }
    return { from, returnTo: sanitizeReturnTo(returnTo), at };
  } catch { clearAccountSwitch(); return null; }
}

export function clearAccountSwitch(): void { getSessionStorage().removeItem(KEY); }

/**
 * Decides once the server has named the signed-in member. "switched" only for a different member; the same member
 * signing back in ends the switch silently. Nothing is decided while signed out (the login may still be in progress).
 */
export function settleAccountSwitch(currentUserId: string | null, now = Date.now()): "switched" | "same" | null {
  if (!currentUserId) return null;
  const pending = readAccountSwitch(now);
  if (!pending) return null;
  clearAccountSwitch();
  return pending.from === currentUserId ? "same" : "switched";
}

/** Written by every sign-out. A page the browser restores from its back-forward cache after that reloads instead of showing the old account. */
export function markSignedOut(now = Date.now()): void { getSessionStorage().setItem(SIGNED_OUT_KEY, String(now)); }

export function signedOutSince(loadedAt: number): boolean {
  const value = Number(getSessionStorage().getItem(SIGNED_OUT_KEY));
  return Number.isFinite(value) && value >= loadedAt;
}

/** Installs the back-forward cache guard once per page. Returns the remover. */
export function guardRestoredPagesAfterSignOut(reload: () => void = () => window.location.reload()): () => void {
  const loadedAt = Date.now();
  const onShow = (event: PageTransitionEvent) => { if (event.persisted && signedOutSince(loadedAt)) reload(); };
  window.addEventListener("pageshow", onShow);
  return () => window.removeEventListener("pageshow", onShow);
}
