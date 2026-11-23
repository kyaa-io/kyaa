import { describe, expect, it } from "vitest";
import { landingHandoff, externalBrowserUrl, planGoogleLogin, requiresGoogleBrowserHandoff } from "./login-browser-policy";

const loginUrl = "https://kyaa.io/login?returnTo=%2Fko%2Fc%2Felina&locale=ko&intent=reserve";

const agents = {
  iosInstagram: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22B83 Instagram 350.0.2.15.84 (iPhone15,2; iOS 18_1; ko_KR; ko; scale=3.00; 1179x2556; 650522985)",
  iosFacebook: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22B83 [FBAN/FBIOS;FBAV/500.0.0.0.0;FBBV/1;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/18.1;FBLC/ko_KR]",
  iosKakao: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22B83 KAKAOTALK 11.0.0",
  iosSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  iosChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1",
  androidInstagram: "Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.102 Mobile Safari/537.36 Instagram 350.0.0.46.108 Android (34/14; 480dpi; 1080x2340; samsung; SM-S918N; dm3q; qcom; ko_KR; 650522985)",
  androidFacebook: "Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.102 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/500.0.0.0.0;]",
  androidKakao: "Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.102 Mobile Safari/537.36 KAKAOTALK/11.0.0",
  iosX: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22B83 Twitter for iPhone",
  androidX: "Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.102 Mobile Safari/537.36 TwitterAndroid",
  androidChrome: "Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
};

describe("Google browser policy", () => {
  it.each(["Instagram 350.0", "KAKAOTALK 11.0", "[FBAN/FBIOS;FBAV/500.0]", "Mozilla/5.0 Line/15.0", "instagram"]) ("requires handoff for %s", (agent) => {
    expect(requiresGoogleBrowserHandoff(agent)).toBe(true);
  });
  it.each(["", "Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36", "Mozilla/5.0 Firefox/130.0", "Mozilla/5.0 Edg/130.0"]) ("keeps normal OAuth for %s", (agent) => {
    expect(requiresGoogleBrowserHandoff(agent)).toBe(false);
  });
});

describe("X app browser", () => {
  it.each(["iosX", "androidX"] as const)("requires handoff for %s", (name) => {
    expect(requiresGoogleBrowserHandoff(agents[name])).toBe(true);
  });
  // X drops x-safari-https:// and intent:// silently (0 of 118 hand-offs arrived, 2026-11-23), so it gets the manual notice.
  it.each(["iosX", "androidX"] as const)("gives %s the manual notice instead of a hand-off the app ignores", (name) => {
    expect(externalBrowserUrl(agents[name], loginUrl)).toBeNull();
    expect(planGoogleLogin(agents[name], loginUrl)).toEqual({ kind: "notice" });
    expect(landingHandoff(agents[name], new URL(loginUrl))).toEqual({ target: null, fallback: null });
  });
  it.each(["iosInstagram", "iosKakao", "androidKakao"] as const)("keeps %s handoff", (name) => {
    expect(requiresGoogleBrowserHandoff(agents[name])).toBe(true);
  });
});

describe("Google login plan", () => {
  it("hands iOS Instagram to Instagram's own external-browser link with the page address encoded", () => {
    expect(planGoogleLogin(agents.iosInstagram, loginUrl)).toEqual({
      kind: "external",
      url: `instagram://extbrowser/?url=${encodeURIComponent(loginUrl)}`,
    });
  });
  it.each(["iosKakao", "androidKakao"] as const)("hands %s to the phone's browser with KakaoTalk's own link", (name) => {
    expect(planGoogleLogin(agents[name], loginUrl)).toEqual({ kind: "external", url: `kakaotalk://web/openExternal?url=${encodeURIComponent(loginUrl)}` });
  });
  it.each(["iosFacebook"] as const)("hands iOS %s to Safari", (name) => {
    expect(planGoogleLogin(agents[name], loginUrl)).toEqual({
      kind: "external",
      url: "x-safari-https://kyaa.io/login?returnTo=%2Fko%2Fc%2Felina&locale=ko&intent=reserve",
    });
  });
  it.each(["androidInstagram", "androidFacebook"] as const)("hands Android %s to the browser by intent", (name) => {
    expect(planGoogleLogin(agents[name], loginUrl)).toEqual({
      kind: "external",
      url: `intent://kyaa.io/login?returnTo=%2Fko%2Fc%2Felina&locale=ko&intent=reserve#Intent;scheme=https;action=android.intent.action.VIEW;S.browser_fallback_url=${encodeURIComponent(loginUrl)};end`,
    });
  });
  it("detects Threads (Barcelona) and returns to the same https sign-in page when no handler opens", () => {
    const threads = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Mobile/22B83 Barcelona 350.0.0.10.80 (iPhone15,2; iOS 18_1)";
    expect(requiresGoogleBrowserHandoff(threads)).toBe(true);
    expect(planGoogleLogin(threads, loginUrl).kind).toBe("external");
    const plan = planGoogleLogin(agents.androidInstagram, loginUrl);
    expect(plan.kind === "external" && plan.url).toContain("S.browser_fallback_url=https%3A%2F%2Fkyaa.io%2Flogin%3F");
  });
  it.each(["iosSafari", "iosChrome", "androidChrome"] as const)("keeps the normal flow for %s", (name) => {
    expect(planGoogleLogin(agents[name], loginUrl)).toEqual({ kind: "continue" });
  });
  it("shows the manual notice when no platform hand-off is known or the page is not https", () => {
    expect(planGoogleLogin("Mozilla/5.0 (X11; Linux) Instagram 350.0", loginUrl)).toEqual({ kind: "notice" });
    expect(planGoogleLogin(agents.iosInstagram, "http://localhost:3000/login")).toEqual({ kind: "notice" });
    expect(planGoogleLogin(agents.iosInstagram, "not a url")).toEqual({ kind: "notice" });
  });
  it("never carries tokens, credentials or tracking", () => {
    expect(externalBrowserUrl(agents.iosInstagram, "https://user:pw@kyaa.io/login")).toBeNull();
    expect(externalBrowserUrl(agents.iosInstagram, loginUrl)).not.toMatch(/utm_|token|session/i);
  });
});

describe("embedded browsers without a dedicated rule", () => {
  const ios = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)";
  const androidWebView = "Mozilla/5.0 (Linux; Android 14; SM-S921N Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.58 Mobile Safari/537.36";
  const embedded = {
    iosTikTok: `${ios} Mobile/15E148 musical_ly_36.5.0 JsSdk/2.0 NetType/WIFI Channel/App Store ByteLocale/ko Region/KR BytedanceWebview/d8a21c6`,
    androidTikTok: `${androidWebView} trill_360505 JsSdk/1.0 NetType/WIFI AppName/trill BytedanceWebview/d8a21c6`,
    androidTelegram: `${androidWebView} Telegram-Android/11.4.2 (Samsung SM-S921N; Android 14; SDK 34; HIGH)`,
    androidUnknownApp: androidWebView,
    iosUnknownApp: `${ios} Mobile/15E148`,
  };
  it.each(Object.keys(embedded) as Array<keyof typeof embedded>)("hands %s to an external browser", (name) => {
    expect(requiresGoogleBrowserHandoff(embedded[name])).toBe(true);
    const plan = planGoogleLogin(embedded[name], loginUrl);
    expect(plan.kind).toBe("external");
    if (plan.kind === "external") expect(plan.url.startsWith(name.startsWith("ios") ? "x-safari-https://kyaa.io/login?" : "intent://kyaa.io/login?")).toBe(true);
  });
  it("keeps Google sign-in in a page opened from the iOS home screen", () => {
    expect(requiresGoogleBrowserHandoff(embedded.iosUnknownApp, true)).toBe(false);
    expect(planGoogleLogin(embedded.iosUnknownApp, loginUrl, true)).toEqual({ kind: "continue" });
  });
  it.each(["iosSafari", "iosChrome", "androidChrome"] as const)("keeps Google sign-in in %s", (name) => {
    expect(planGoogleLogin(agents[name], loginUrl)).toEqual({ kind: "continue" });
  });
  it.each([
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/131.0 Mobile/15E148 Safari/605.1.15",
    "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
    "Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0",
  ])("keeps Google sign-in in an ordinary browser: %s", (agent) => {
    expect(requiresGoogleBrowserHandoff(agent)).toBe(false);
  });
});

describe("landing handoff", () => {
  it.each([
    [agents.iosInstagram, "instagram://extbrowser/"], [agents.iosKakao, "kakaotalk://web/openExternal"],
    [agents.iosFacebook, "x-safari-https://"],
    ["iPhone TikTok", "x-safari-https://"], ["iPhone Line/15", "https://kyaa.io/login?"],
  ])("preserves the landing and source for %s", (ua, prefix) => {
    const {target} = landingHandoff(ua,new URL(loginUrl));
    expect(target?.startsWith(prefix)).toBe(true);
    expect(decodeURIComponent(target!)).toContain("kyaa_browser=");
  });
  it("offers a package-free fallback for Android", () => {
    const plan = landingHandoff(agents.androidInstagram,new URL(loginUrl));
    expect(plan.target).toContain("package=com.android.chrome");
    expect(plan.fallback).not.toContain("package=");
  });
});
