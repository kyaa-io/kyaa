import { describe, expect, it } from "vitest";
import { ga4PageLocation, ga4PageReferrer, ga4Payload, readGa4MeasurementId } from "./ga4";
import { GA4_EVENT_NAME } from "./funnel-event";

describe("GA4 boundary", () => {
  it("accepts only GA4 measurement IDs", () => {
    expect(readGa4MeasurementId("G-WKSF9KP5QW")).toBe("G-WKSF9KP5QW");
    expect(readGa4MeasurementId(" G-HPXFR0PQP0 ")).toBe("G-HPXFR0PQP0");
    for (const value of [undefined, "", "UA-12345-1", "GTM-M7L3HQ7Z", "g-wksf9kp5qw", "G-<script>"]) expect(readGa4MeasurementId(value)).toBe("");
  });

  it.each([
    ["/", "https://kyaa.io/", "home"],
    ["/elina", "https://kyaa.io/elina", "creator"],
    ["/c/elina/verify/questions", "https://kyaa.io/c/elina/verify/questions", "verification"],
    ["/passports/95800000-0000-4000-8000-000000000011", "https://kyaa.io/passports/:id", "passport"],
    ["/s/AbCdEf0123456789xyz", "https://kyaa.io/s/:token", "other"],
    ["/i/abc", "https://kyaa.io/i/:token", "other"],
    ["/c/elina/notices/12345", "https://kyaa.io/c/elina/notices/:id", "creator"],
    ["/my/rewards/Private%20Name", "https://kyaa.io/my/rewards/:id", "my"],
  ])("sends %s as %s", (path, location, kind) => {
    expect(ga4PageLocation("https://kyaa.io", path)?.location).toBe(location);
    if (kind !== "creator") expect(ga4PageLocation("https://kyaa.io", path)?.kind).toBe(kind);
  });

  it("does not send staff or sign-in plumbing screens", () => {
    for (const path of ["/admin/traffic", "/operator", "/api/events", "/auth/callback", "/connect/instagram"]) expect(ga4PageLocation("https://kyaa.io", path)).toBeNull();
  });

  it("keeps only another site's origin as referrer", () => {
    expect(ga4PageReferrer("https://www.instagram.com/p/abc?igshid=123", "https://kyaa.io")).toBe("https://www.instagram.com");
    expect(ga4PageReferrer("https://kyaa.io/login?returnTo=/my", "https://kyaa.io")).toBe("");
    expect(ga4PageReferrer("", "https://kyaa.io")).toBe("");
  });

  it("allows only listed parameters and values", () => {
    expect(ga4Payload("share", { method: "copy", content_type: "post" })).not.toBeNull();
    expect(ga4Payload("fan_verification_submit", { outcome: "failed", score: 1 })).not.toBeNull();
    expect(ga4Payload("share", { method: "copy", content_type: "post", url: "https://kyaa.io/x" })).toBeNull();
    expect(ga4Payload("login", { method: "google", email: "a@b.c" })).toBeNull();
    expect(ga4Payload("fan_verification_submit", { outcome: "failed", score: 7 })).toBeNull();
    expect(ga4Payload("post_create", { board: "fan", creator: "elina" })).toBeNull();
    expect(ga4Payload("purchase", {})).toBeNull();
  });

  it("has a parameter list for every GA4 name the self ledger maps to, except comment_create", () => {
    for (const name of Object.values(GA4_EVENT_NAME)) {
      if (name === "comment_create") continue;
      expect(ga4Payload(name, {}), name).not.toBeNull();
    }
  });
});
