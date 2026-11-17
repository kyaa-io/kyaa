import { describe, expect, it } from "vitest";
import { clientProductEventV1Schema } from "./product-event";
import { EVENT_SOURCE_EVENT_SOURCE, eventSourceFromSearch, withEventSourceReturn } from "./event-source-tag";

const link = "?locale=en&utm_source=telegram&utm_medium=community&utm_campaign=elina-onboarding-1117&utm_content=cgaa";

describe("fan page event source tag", () => {
  it("accepts a known source, an event key of this page and a public code", () => {
    expect(eventSourceFromSearch(link, "elina")).toEqual({ source: "telegram", campaign: "elina-onboarding-1117", content: "cgaa" });
    for (const source of ["x", "kol"]) expect(eventSourceFromSearch(link.replace("telegram", source), "elina")?.source).toBe(source);
  });
  it.each([
    ["an unknown source", link.replace("telegram", "instagram")],
    ["an upper-case source", link.replace("telegram", "Telegram")],
    ["an unknown event key", link.replace("elina-onboarding-1117", "elina-onboarding-9999")],
    ["a code with free text", link.replace("cgaa", "Kim%20Minsu")],
    ["a code with an underscore", link.replace("cgaa", "a_b")],
    ["a code over 24 characters", link.replace("cgaa", "a".repeat(25))],
    ["an empty code", link.replace("utm_content=cgaa", "utm_content=")],
    ["a missing campaign", "?utm_source=telegram&utm_content=cgaa"],
  ])("rejects %s", (_name, search) => {
    expect(eventSourceFromSearch(search, "elina")).toBeNull();
  });
  it("does not credit an event key to another fan page", () => {
    expect(eventSourceFromSearch(link, "changha")).toBeNull();
    expect(eventSourceFromSearch(link.replace("elina-onboarding-1117", "changha-onboarding-1118"), "changha")?.campaign).toBe("changha-onboarding-1118");
  });
  it("keeps the tag in the return address, and only the validated UTM", () => {
    expect(withEventSourceReturn("/elina?locale=en", `${link}&email=a%40b.c`, "elina"))
      .toBe("/elina?locale=en&utm_source=telegram&utm_medium=community&utm_campaign=elina-onboarding-1117&utm_content=cgaa");
    expect(withEventSourceReturn("/elina?tab=board&locale=ko#top", link, "elina")).toBe("/elina?tab=board&locale=ko&utm_source=telegram&utm_medium=community&utm_campaign=elina-onboarding-1117&utm_content=cgaa#top");
    expect(withEventSourceReturn("/elina?locale=en", link.replace("cgaa", "Kim%20Minsu"), "elina")).toBe("/elina?locale=en");
    expect(withEventSourceReturn("/elina?locale=en", "?utm_source=telegram&utm_medium=Bad%20Medium&utm_campaign=elina-onboarding-1117&utm_content=cgaa", "elina")).not.toContain("utm_medium");
  });
  it("is accepted only as a signed-in creator_page_view with exactly the three tag fields", () => {
    const event = { schemaVersion: 1, eventName: "creator_page_view", anonymousSessionId: null, celebrityId: null, liveEventId: null, missionId: null, benefitId: null,
      source: EVENT_SOURCE_EVENT_SOURCE, idempotencyKey: "page:creator_page_view:12345678", occurredAt: new Date().toISOString(),
      properties: { source: "telegram", campaign: "elina-onboarding-1117", content: "cgaa" } };
    expect(clientProductEventV1Schema.safeParse(event).success).toBe(true);
    expect(clientProductEventV1Schema.safeParse({ ...event, anonymousSessionId: "anonymous-session-123" }).success).toBe(false);
    expect(clientProductEventV1Schema.safeParse({ ...event, eventName: "live_page_view" }).success).toBe(false);
    expect(clientProductEventV1Schema.safeParse({ ...event, properties: { ...event.properties, url: "https://kyaa.io/elina?x=1" } }).success).toBe(false);
    expect(clientProductEventV1Schema.safeParse({ ...event, properties: { ...event.properties, content: "Kim Minsu" } }).success).toBe(false);
    expect(clientProductEventV1Schema.safeParse({ ...event, properties: { ...event.properties, source: "instagram" } }).success).toBe(false);
    expect(clientProductEventV1Schema.safeParse({ ...event, properties: { ...event.properties, campaign: "other" } }).success).toBe(false);
  });
});
