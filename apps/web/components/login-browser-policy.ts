// Match known app markers only; ordinary mobile browsers keep their normal login flow.
export function requiresGoogleBrowserHandoff(userAgent: string): boolean {
  return /Instagram|Barcelona|KAKAOTALK|\bFBAN\/|\bFBAV\/|\bLine\//i.test(userAgent);
}

export function isIosInstagram(userAgent: string): boolean {
  return /iPhone|iPad|iPod/i.test(userAgent) && /Instagram/i.test(userAgent);
}

// Builds a link that asks the OS to open the sign-in page in the user's own browser.
// The page address is reused as-is (path and query only); no token or session is added.
// Returns null when the platform has no known hand-off, so the caller keeps the manual notice.
export function externalBrowserUrl(userAgent: string, loginUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(loginUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  const target = `${url.host}${url.pathname}${url.search}`;
  if (/iPhone|iPad|iPod/i.test(userAgent)) {
    // Instagram's own external-browser link (it asks the person to confirm). Public reports say its in-app
    // browser silently ignores x-safari-https in recent builds; other apps keep the Safari scheme.
    if (isIosInstagram(userAgent)) return `instagram://extbrowser/?url=${encodeURIComponent(url.href)}`;
    return `x-safari-https://${target}`;
  }
  // browser_fallback_url sends the app back to the same sign-in page when no handler opens the intent.
  if (/Android/i.test(userAgent)) return `intent://${target}#Intent;scheme=https;action=android.intent.action.VIEW;S.browser_fallback_url=${encodeURIComponent(url.href)};end`;
  return null;
}

export type GoogleLoginPlan =
  | { kind: "continue" }
  | { kind: "external"; url: string }
  | { kind: "notice" };

export function planGoogleLogin(userAgent: string, loginUrl: string): GoogleLoginPlan {
  if (!requiresGoogleBrowserHandoff(userAgent)) return { kind: "continue" };
  const url = externalBrowserUrl(userAgent, loginUrl);
  return url ? { kind: "external", url } : { kind: "notice" };
}
