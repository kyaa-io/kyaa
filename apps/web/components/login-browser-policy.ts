export const isXBrowser = (userAgent: string) => /\bTwitter(?:Android| for iPhone| for iPad|\/|\b)|\bX\/\d/i.test(userAgent);

// Apps that show pages in their own embedded browser and say so in the user agent.
const EMBEDDED_APP = /Instagram|Barcelona|KAKAOTALK|\bFBAN\/|\bFBAV\/|\bLine\/|musical_ly|BytedanceWebview|\bTikTok\b|\btrill_|Telegram|MicroMessenger|NAVER\(inapp|DaumApps|Snapchat|LinkedInApp|WhatsApp/i;

// Google refuses sign-in (403 disallowed_useragent) from embedded browsers. Besides the named apps, two generic
// shapes mark one: Android System WebView ("; wv)") and iOS WebKit without the "Safari/" token every real iOS
// browser sends. A home-screen web app has the same iOS shape but is not embedded, so the caller passes `standalone`.
export function requiresGoogleBrowserHandoff(userAgent: string, standalone = false): boolean {
  if (EMBEDDED_APP.test(userAgent) || isXBrowser(userAgent)) return true;
  if (/Android/i.test(userAgent)) return /; wv\)/.test(userAgent);
  return !standalone && /iPhone|iPad|iPod/i.test(userAgent) && /AppleWebKit/i.test(userAgent) && !/Safari\//i.test(userAgent);
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
  // X on iPhone ignores x-safari-https:// opened by script: 0 of 118 automatic hand-offs arrived in 7 days (2026-11-23,
  // iPhone and Android counted together). A tap on the page's own link is the only chance there (landingHandoff).
  // Android X hands intent:// to the system like other WebView apps, so it keeps the hand-off below.
  if (isXBrowser(userAgent) && !/Android/i.test(userAgent)) return null;
  const target = `${url.host}${url.pathname}${url.search}`;
  // KakaoTalk's own link for opening a page in the phone's browser, the same on iOS and Android.
  if (/KAKAOTALK/i.test(userAgent)) return `kakaotalk://web/openExternal?url=${encodeURIComponent(url.href)}`;
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

export function planGoogleLogin(userAgent: string, loginUrl: string, standalone = false): GoogleLoginPlan {
  if (!requiresGoogleBrowserHandoff(userAgent, standalone)) return { kind: "continue" };
  const url = externalBrowserUrl(userAgent, loginUrl);
  return url ? { kind: "external", url } : { kind: "notice" };
}

const appMarkers = [
  ["instagram", /Instagram/i], ["threads", /Barcelona/i], ["kakao", /KAKAOTALK/i],
  ["facebook", /\bFB(?:AN|AV|_IAB)\//i], ["line", /\bLine\//i],
  ["tiktok", /musical_ly|BytedanceWebview|TikTok|\btrill_/i], ["telegram", /Telegram/i],
] as const;

export function embeddedApp(ua: string) {
  return isXBrowser(ua) ? "x" : appMarkers.find(([, marker]) => marker.test(ua))?.[0] ?? "webview";
}

/** Which app's built-in browser opened the page, or "browser" for an ordinary one. Only the kind is kept, never the user agent. */
export function inAppBrowserKind(ua: string) {
  return isXBrowser(ua) || EMBEDDED_APP.test(ua) ? embeddedApp(ua) : "browser";
}

export type HandoffMethod = "line" | "kakao" | "instagram" | "safari" | "intent";

// `target` opens by itself on arrival; `fallback` is the link the person taps. `browser` is "safari" when the tap link
// can only open Safari (x-safari-https), for the button label; other links open the phone's own browser.
export function landingHandoff(ua: string, address: URL): { target: string | null; fallback: string | null; browser: "safari" | null; method: HandoffMethod | null } {
  const marked = new URL(address);
  marked.searchParams.set("kyaa_browser", embeddedApp(ua));
  if (/\bLine\//i.test(ua)) {
    marked.searchParams.set("openExternalBrowser", "1");
    return { target: marked.href, fallback: marked.href, browser: null, method: "line" };
  }
  const ios = /iPhone|iPad|iPod/i.test(ua);
  if (ios && isXBrowser(ua) && marked.protocol === "https:") {
    // iPhone X: no automatic attempt (see externalBrowserUrl). A real tap may still get iOS's "Open in Safari?" prompt.
    return { target: null, fallback: `x-safari-https://${marked.host}${marked.pathname}${marked.search}`, browser: "safari", method: "safari" };
  }
  const fallback = externalBrowserUrl(ua, marked.href);
  if (!fallback) return { target: null, fallback: null, browser: null, method: null };
  if (fallback.startsWith("intent://")) {
    // The automatic try names Chrome; without Chrome, browser_fallback_url reloads this page with kyaa_browser set, which
    // stops a second try. The tapped link names no package, so the phone's default browser or chooser answers it.
    return { target: fallback.replace("#Intent;", "#Intent;package=com.android.chrome;"), fallback, browser: null, method: "intent" };
  }
  const method: HandoffMethod = fallback.startsWith("kakaotalk:") ? "kakao" : fallback.startsWith("instagram:") ? "instagram" : "safari";
  return { target: fallback, fallback, browser: method === "safari" ? "safari" : null, method };
}
