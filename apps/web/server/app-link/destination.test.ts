import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { readKyaaStoreLinks, resolveAppLinkDestination, safeAppReturnTo } from "./destination";

describe("app-link destination", () => {
  it("accepts exact owned activity destinations and rejects malformed IDs", () => {
    const id = "10000000-0000-4000-8000-000000000001";
    for (const path of [`/support/${id}`, `/activities/${id}`, "/my/community-stamps"]) {
      expect(resolveAppLinkDestination(path)).toMatchObject({ valid: true, returnTo: path, webReturnTo: "/" });
    }
    for (const prefix of ["support", "activities", "stamps"]) {
      expect(safeAppReturnTo(`/${prefix}/------------------------------------`)).toBeNull();
      expect(safeAppReturnTo(`/${prefix}/${id}?token=private`)).toBeNull();
    }
  });
  it("opens social notifications in the app with a safe web fallback", () => {
    const id = "10000000-0000-4000-8000-000000000001";
    for (const returnTo of [`/messages/${id}`, `/people/${id}/friend-request?favorite=kara`]) {
      expect(resolveAppLinkDestination(returnTo)).toMatchObject({ valid: true, returnTo, kind: "content", webReturnTo: "/" });
    }
    expect(safeAppReturnTo("/messages/------------------------------------")).toBeNull();
    expect(safeAppReturnTo(`/people/${id}/friend-request?favorite=../private`)).toBeNull();
  });
  it.each([
    "/s/0123456789abcdef0123456789abcdef?locale=ko",
    "/c/elina/raffles?locale=en&authIntent=10000000-0000-4000-8000-000000000001",
    "/my?invite=FRIEND24#community-stamps",
    "/fans/profile-links/10000000-0000-4000-8000-000000000001?locale=ko",
    "/participation/events/10000000-0000-4000-8000-000000000001?locale=ko",
    "/participation/spaces/10000000-0000-4000-8000-000000000001",
  ])("preserves an approved same-origin destination byte-for-byte: %s", value => expect(safeAppReturnTo(value)).toBe(value));

  it.each(["https://evil.test/path", "//evil.test/path", "/api/me?token=secret", "/admin", "/open-app?returnTo=/", "/settings/kakao/callback", "/my/inquiries/private-id", "/my?next=public-value", "/my?tab=one&tab=two", "/my?tab=eyJhbGciOiJIUzI1NiJ9.abcdefghijk.signaturevalue", ["/my", "/live/show"]])("rejects external, privileged, looping, private, unknown, duplicate, or credential targets: %j", value => expect(safeAppReturnTo(value)).toBeNull());

  it("builds only the kyaa open contract and safely falls back home", () => {
    expect(resolveAppLinkDestination("/live/kara?locale=ko")).toMatchObject({ returnTo: "/live/kara?locale=ko", appUrl: "kyaa-app:///open?returnTo=%2Flive%2Fkara%3Flocale%3Dko", valid: true, kind: "live" });
    expect(resolveAppLinkDestination("javascript:alert(1)")).toMatchObject({ returnTo: "/", appUrl: "kyaa-app:///open?returnTo=%2F", valid: false });
    expect(resolveAppLinkDestination("/participation/events/10000000-0000-4000-8000-000000000001")).toMatchObject({ valid: true, kind: "content", webReturnTo: "/" });
    expect(safeAppReturnTo("/participation/events/------------------------------------")).toBeNull();
    expect(safeAppReturnTo("/participation/contexts/event/10000000-0000-4000-8000-000000000001")).toBeNull();
  });

  it("shows install links only for exact configured store URLs", () => {
    expect(readKyaaStoreLinks({ NEXT_PUBLIC_KYAA_APP_STORE_URL: "https://apps.apple.com/kr/app/kyaa/id123456789", NEXT_PUBLIC_KYAA_PLAY_STORE_URL: "https://play.google.com/store/apps/details?id=kr.byus.kyaa" })).toEqual({ apple: "https://apps.apple.com/kr/app/kyaa/id123456789", google: "https://play.google.com/store/apps/details?id=kr.byus.kyaa" });
    expect(readKyaaStoreLinks({ NEXT_PUBLIC_KYAA_APP_STORE_URL: "https://example.test/id123", NEXT_PUBLIC_KYAA_PLAY_STORE_URL: "https://play.google.com/store/apps/details?id=" })).toEqual({ apple: null, google: null });
  });

  it("keeps a fan clip app destination and returns web visitors to its creator", () => {
    expect(resolveAppLinkDestination("/c/artist/clips/10000000-0000-4000-8000-000000000001?locale=ko"))
      .toMatchObject({ valid: true, webReturnTo: "/c/artist", returnTo: "/c/artist/clips/10000000-0000-4000-8000-000000000001?locale=ko" });
  });
});
