import { describe, expect, it } from "vitest";
import { isNativeAppAvailable, openAppWebPath } from "./open-app-redirect";

const apple = "https://apps.apple.com/kr/app/kyaa/id123456789";
const passport = "/s/0123456789abcdef0123456789abcdef";
const via = (returnTo: string, extra = "") => openAppWebPath(`returnTo=${encodeURIComponent(returnTo)}${extra}`);

describe("native app availability", () => {
  it("needs the flag and at least one valid store link", () => {
    expect(isNativeAppAvailable({})).toBe(false);
    expect(isNativeAppAvailable({ NEXT_PUBLIC_KYAA_APP_STORE_URL: apple })).toBe(false);
    expect(isNativeAppAvailable({ NATIVE_APP_AVAILABLE: "true" })).toBe(false);
    expect(isNativeAppAvailable({ NATIVE_APP_AVAILABLE: "true", NEXT_PUBLIC_KYAA_APP_STORE_URL: "https://example.test/id1" })).toBe(false);
    expect(isNativeAppAvailable({ NATIVE_APP_AVAILABLE: "1", NEXT_PUBLIC_KYAA_APP_STORE_URL: apple })).toBe(false);
    expect(isNativeAppAvailable({ NATIVE_APP_AVAILABLE: "true", NEXT_PUBLIC_KYAA_APP_STORE_URL: apple })).toBe(true);
  });
});

describe("open-app web redirect target", () => {
  it("follows a safe same-origin destination and keeps its own query and hash", () => {
    expect(via(passport)).toBe(passport);
    expect(via(`${passport}?locale=en`)).toBe(`${passport}?locale=en`);
    expect(via("/live/kara-live?utm_source=news&tab=info#schedule")).toBe("/live/kara-live?utm_source=news&tab=info#schedule");
    expect(via("/c/kara/community/10000000-0000-4000-8000-000000000001#comment-10000000-0000-4000-8000-000000000002")).toBe("/c/kara/community/10000000-0000-4000-8000-000000000001#comment-10000000-0000-4000-8000-000000000002");
  });
  it("adds the outer locale and UTM values only where the destination has none", () => {
    expect(via("/live", "&locale=en&utm_source=push&utm_campaign=may")).toBe("/live?locale=en&utm_source=push&utm_campaign=may");
    expect(via("/live?utm_source=own", "&utm_source=outer&utm_medium=m")).toBe("/live?utm_source=own&utm_medium=m");
    expect(openAppWebPath("locale=en&utm_source=push")).toBe("/?locale=en&utm_source=push");
  });
  it("ignores outer values that are not plain words", () => {
    expect(via("/live", "&locale=xx&utm_source=a%20b&utm_medium=https%3A%2F%2Fevil.test")).toBe("/live");
  });
  it("uses the web parent where the destination only exists in the app", () => {
    const id = "10000000-0000-4000-8000-000000000001";
    for (const path of [`/messages/${id}`, `/support/${id}`, `/activities/${id}`, `/people/${id}/friend-request?favorite=kara`, `/participation/events/${id}`]) expect(via(path)).toBe("/");
    expect(via("/my/community-stamps")).toBe("/passports");
    expect(via(`/c/kara/clips/${id}`)).toBe("/c/kara");
    expect(via(`/stamps/${id}`)).toBe(`/stamps/${id}`);
  });
  it("sends anything that could leave the site, or is not allowed, home", () => {
    for (const value of ["https://evil.test/path", "//evil.test/path", "///evil.test", "/\\evil.test", "\\evil.test", "javascript:alert(1)", "http:evil.test", "evil.test", "/%2F%2Fevil.test", "/api/me", "/admin", "/login", "/open-app?returnTo=/", "/live?access_token=secret", "/live?next=https://evil.test", "/live#access_token=abc", "/live\n/x", ""]) {
      expect(via(value), value).toBe("/");
    }
    expect(openAppWebPath("")).toBe("/");
    expect(openAppWebPath("returnTo=/live&returnTo=/benefits")).toBe("/");
    expect(openAppWebPath("returnTo=%E0%A4%A")).toBe("/");
  });
  it("always returns a relative path on this site", () => {
    for (const value of ["https://evil.test", "//evil.test", "/live"]) expect(via(value)).toMatch(/^\/(?!\/)/);
  });
});
