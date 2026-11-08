import { describe, expect, it } from "vitest";
import { clientProductEventV1Schema, productEventV1Schema, PRODUCT_EVENT_NAMES } from "./product-event";
import { deviceContext, GA4_EVENT_NAME, pageKindForPath } from "./funnel-event";

const base = {
  schemaVersion: 1 as const, anonymousSessionId: "session-000000000001", celebrityId: null, liveEventId: null,
  missionId: null, benefitId: null, occurredAt: "2026-11-08T00:00:00.000Z",
};
const pageView = {
  ...base, eventName: "page_view", source: "web.page_view",
  idempotencyKey: "page-view:95800000-0000-4000-8000-000000000101",
  properties: { pageKind: "community", entry: true, channel: "social", device: "mobile", browser: "instagram", os: "ios" },
};
const share = {
  ...base, eventName: "share_completed", source: "web.share",
  idempotencyKey: "share:95800000-0000-4000-8000-000000000111:completed",
  properties: { method: "copy", contentType: "post" },
};

describe("funnel events", () => {
  it.each([
    ["/", "home"], ["/community", "community"], ["/c/elina/community", "community"], ["/c/elina/lounge", "community"],
    ["/login", "login"], ["/onboarding/profile", "onboarding"], ["/c/elina/verify", "verification"],
    ["/c/elina/verify/questions", "verification"], ["/passports", "passport"], ["/my/wallet", "my"], ["/elina", "creator"],
    ["/c/elina/raffles/gift", "benefit"], ["/open-app", "other"], ["/admin/traffic", null], ["/operator", null], ["/api/events", null],
  ])("classifies %s as %s without keeping the path", (path, kind) => {
    expect(pageKindForPath(path)).toBe(kind);
  });

  it("detects coarse device context only", () => {
    expect(deviceContext("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit Instagram 300")).toEqual({ device: "mobile", browser: "instagram", os: "ios" });
    expect(deviceContext("Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit Chrome/130 Safari/537.36")).toEqual({ device: "tablet", browser: "chrome", os: "android" });
    expect(deviceContext("Mozilla/5.0 (Macintosh) AppleWebKit Version/18 Safari/605")).toEqual({ device: "desktop", browser: "safari", os: "other" });
  });

  it("accepts the anonymous page view and the share event", () => {
    expect(clientProductEventV1Schema.safeParse(pageView).success).toBe(true);
    expect(clientProductEventV1Schema.safeParse(share).success).toBe(true);
    expect(clientProductEventV1Schema.safeParse({ ...share, anonymousSessionId: null }).success).toBe(true);
  });

  it.each([
    ["a path", { ...pageView, properties: { ...pageView.properties, path: "/community?post=1" } }],
    ["a free-form kind", { ...pageView, properties: { ...pageView.properties, pageKind: "/my/settings" } }],
    ["a channel on a later screen", { ...pageView, properties: { ...pageView.properties, entry: false } }],
    ["a creator owner", { ...pageView, celebrityId: "95800000-0000-4000-8000-000000000021" }],
    ["another source", { ...pageView, source: "web.outbound" }],
    ["a reused key shape", { ...pageView, idempotencyKey: "page:creator_page_view:abc12345" }],
    ["a share URL", { ...share, properties: { ...share.properties, url: "https://kyaa.io/x" } }],
  ])("rejects %s", (_name, event) => {
    expect(clientProductEventV1Schema.safeParse(event).success).toBe(false);
  });

  it("accepts a page view owned by a member and refuses one with two owners", () => {
    expect(productEventV1Schema.safeParse({ ...pageView, anonymousSessionId: null, appUserId: "95800000-0000-4000-8000-000000000011" }).success).toBe(true);
    expect(productEventV1Schema.safeParse({ ...pageView, appUserId: "95800000-0000-4000-8000-000000000011" }).success).toBe(false);
  });

  it("keeps server projections out of the browser and maps every funnel event to a GA4 name", () => {
    for (const eventName of ["fan_verification_started", "fan_verification_submitted", "daily_checkin_completed", "post_created", "comment_created", "cheer_completed"]) {
      expect(PRODUCT_EVENT_NAMES).toContain(eventName);
      expect(clientProductEventV1Schema.safeParse({ ...share, eventName }).success).toBe(false);
      expect(GA4_EVENT_NAME).toHaveProperty(eventName);
    }
  });
});
