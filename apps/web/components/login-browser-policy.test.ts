import { describe, expect, it } from "vitest";
import { externalBrowserUrl, planGoogleLogin, requiresGoogleBrowserHandoff } from "./login-browser-policy";

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

describe("Google login plan", () => {
  it("hands iOS Instagram to Instagram's own external-browser link with the page address encoded", () => {
    expect(planGoogleLogin(agents.iosInstagram, loginUrl)).toEqual({
      kind: "external",
      url: `instagram://extbrowser/?url=${encodeURIComponent(loginUrl)}`,
    });
  });
  it.each(["iosKakao", "iosFacebook"] as const)("hands iOS %s to Safari", (name) => {
    expect(planGoogleLogin(agents[name], loginUrl)).toEqual({
      kind: "external",
      url: "x-safari-https://kyaa.io/login?returnTo=%2Fko%2Fc%2Felina&locale=ko&intent=reserve",
    });
  });
  it.each(["androidInstagram", "androidKakao", "androidFacebook"] as const)("hands Android %s to the browser by intent", (name) => {
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
