import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "../../../proxy";
import { inAppBrowserKind } from "@/components/login-browser-policy";
import { FIRST_TOUCH_COOKIE, LAST_TOUCH_COOKIE, captureTouch, cookieValue, decodeTouch, encodeTouch, isExternalEntry, landingPathPattern } from "./first-touch";
import { shareTagged } from "./share-tag";

const chrome = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36";
const now = new Date("2026-11-26T10:00:00.000Z");

describe("in-app browser kind", () => {
  it.each([
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Twitter for iPhone/10.70", "x"],
    [`${chrome} TwitterAndroid`, "x"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) Mobile/15E148 Instagram 357.0.0.0 (iPhone15,2)", "instagram"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) Mobile/15E148 [FBAN/FBIOS;FBAV/490.0]", "facebook"],
    [`${chrome} musical_ly_2023`, "tiktok"],
    [`${chrome} Telegram-Android/11.4`, "telegram"],
    [`${chrome} KAKAOTALK 10.8.0`, "kakao"],
    [`${chrome} Line/14.0.0`, "line"],
    [chrome, "browser"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.1 Safari/605.1.15", "browser"],
  ])("%s → %s", (ua, kind) => expect(inAppBrowserKind(ua)).toBe(kind));
});

describe("captureTouch", () => {
  it("keeps tags, click id kind, invite code, outside host, app kind, hand-off and a path pattern", () => {
    const touch = captureTouch({
      url: new URL("https://kyaa.io/s/raffle?utm_source=X&utm_medium=kol&utm_campaign=alina&utm_content=kol-alina&twclid=abc123&invite=22FAA88E23ACE107E6105E21&kyaa_browser=x"),
      referer: "https://t.co/xyz", userAgent: chrome, now,
    });
    expect(touch).toEqual({ src: "x", med: "kol", cmp: "alina", cnt: "kol-alina", clk: "twclid", ref: "22FAA88E23ACE107E6105E21", rh: "t.co", app: "browser", via: "x", lp: "/s/raffle", at: now.toISOString() });
    expect(isExternalEntry(touch)).toBe(true);
  });

  it("drops values that are not plain tags and never keeps the click id or the query", () => {
    const touch = captureTouch({ url: new URL("https://kyaa.io/?utm_source=%3Cscript%3E&gclid=secretvalue&email=a%40b.c&kyaa_browser=evil"), referer: "https://kyaa.io/elina", userAgent: chrome, now });
    expect(touch).toEqual({ clk: "gclid", app: "browser", lp: "/", at: now.toISOString() });
    expect(JSON.stringify(touch)).not.toContain("secretvalue");
  });

  it("counts a chemi share link (share id, no tags) as a share", () => {
    for (const address of ["https://kyaa.io/chemi/tarot?from=s1&locale=ko", "https://kyaa.io/chemi/games/match?share=abc"]) {
      expect(captureTouch({ url: new URL(address), referer: null, userAgent: chrome, now })).toMatchObject({ src: "share", med: "referral", cnt: "chemi" });
    }
    expect(captureTouch({ url: new URL("https://kyaa.io/chemi/tarot?from=s1&utm_source=x"), referer: null, userAgent: chrome, now }).src).toBe("x");
    expect(captureTouch({ url: new URL("https://kyaa.io/login?from=s1"), referer: null, userAgent: chrome, now }).src).toBeUndefined();
  });

  it("is direct when nothing says where the visit came from", () => {
    expect(isExternalEntry(captureTouch({ url: new URL("https://kyaa.io/"), referer: null, userAgent: chrome, now }))).toBe(false);
  });

  it.each([
    ["/", "/"], ["/elina", "/elina"], ["/s/raffle", "/s/raffle"], ["/s/Ab3dEf9xYz", "/s/:id"],
    ["/c/elina/raffles/123", "/c/elina"], ["/live/0f8c3a2e-1111", "/live/:id"], ["/my/invitations", "/my/invitations"],
  ])("hides ids in %s", (path, pattern) => expect(landingPathPattern(path)).toBe(pattern));

  it("round-trips through the cookie value and rejects tampered values", () => {
    const touch = captureTouch({ url: new URL("https://kyaa.io/?ref=abc"), referer: null, userAgent: chrome, now });
    expect(decodeTouch(encodeTouch(touch))).toEqual(touch);
    expect(decodeTouch(Buffer.from(JSON.stringify({ ...touch, ip: "1.2.3.4" })).toString("base64url"))).toBeNull();
    expect(decodeTouch("not-json")).toBeNull();
    expect(cookieValue(`a=1; ${FIRST_TOUCH_COOKIE}=${encodeTouch(touch)}; b=2`, FIRST_TOUCH_COOKIE)).toBe(encodeTouch(touch));
  });
});

describe("proxy visit cookies", () => {
  const visit = (path: string, headers: Record<string, string> = {}) =>
    proxy(new NextRequest(`https://kyaa.io${path}`, { headers: { "user-agent": chrome, ...headers } }));

  it("sets the first and latest visit on the first page request, for 90 days, http-only", () => {
    const response = visit("/s/raffle?utm_source=x&utm_medium=kol&utm_campaign=luna", { referer: "https://t.co/a" });
    const first = response.cookies.get(FIRST_TOUCH_COOKIE)!;
    expect(decodeTouch(first.value)).toMatchObject({ src: "x", med: "kol", cmp: "luna", rh: "t.co", lp: "/s/raffle" });
    expect(first).toMatchObject({ httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 90 * 86400 });
    expect(response.cookies.get(LAST_TOUCH_COOKIE)?.value).toBe(first.value);
  });

  it("keeps the first visit and moves only the latest one when a later visit comes from outside", () => {
    const old = encodeTouch(captureTouch({ url: new URL("https://kyaa.io/"), referer: null, userAgent: chrome, now }));
    const later = visit("/?utm_source=email&utm_medium=email&utm_campaign=raffle_mail", { cookie: `${FIRST_TOUCH_COOKIE}=${old}` });
    expect(later.cookies.get(FIRST_TOUCH_COOKIE)).toBeUndefined();
    expect(decodeTouch(later.cookies.get(LAST_TOUCH_COOKIE)!.value)).toMatchObject({ src: "email", cmp: "raffle_mail" });
    const inside = visit("/elina", { cookie: `${FIRST_TOUCH_COOKIE}=${old}`, referer: "https://kyaa.io/" });
    expect(inside.cookies.getAll()).toEqual([]);
  });

  it.each([
    ["/go/kol-luna", {}], ["/i/ab2cdef", {}], ["/admin", {}], ["/", { "user-agent": "Twitterbot/1.0" }], ["/", { rsc: "1" }],
    ["/", { "sec-purpose": "prefetch" }], ["/", { "user-agent": "" }], ["/images/a.png", {}],
  ])("skips %s %j", (path, headers) => {
    expect(visit(path, headers).cookies.getAll()).toEqual([]);
  });
});

describe("share tags", () => {
  it("replaces the sharer's own arrival tags with share tags and the invite code", () => {
    const url = new URL(shareTagged("https://kyaa.io/elina?locale=en&utm_source=x&utm_medium=kol&utm_campaign=luna&gclid=1", "notice", { ref: "ABC123" }));
    expect(Object.fromEntries(url.searchParams)).toEqual({ locale: "en", utm_source: "share", utm_medium: "referral", utm_content: "notice", ref: "ABC123" });
  });

  it("keeps an invite already on the link and sets a given campaign", () => {
    const url = new URL(shareTagged("https://kyaa.io/s/raffle?invite=22FAA88E23ACE107E6105E21", "raffle", { ref: "OTHER", campaign: "kyaa-raffle-202611" }));
    expect(url.searchParams.get("invite")).toBe("22FAA88E23ACE107E6105E21");
    expect(url.searchParams.has("ref")).toBe(false);
    expect(url.searchParams.get("utm_campaign")).toBe("kyaa-raffle-202611");
  });
});
