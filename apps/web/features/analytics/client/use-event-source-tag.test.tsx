import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const record = vi.fn();
vi.mock("./product-event-client", () => ({
  recordProductEventV1: (...args: unknown[]) => record(...args),
  pageViewIdempotencyKey: async (_name: string, route: string, owner: string) => `page:${route}:${owner}`.padEnd(12, "0"),
}));
import { useEventSourceTag } from "./use-event-source-tag";

const props = (over: Partial<Parameters<typeof useEventSourceTag>[0]> = {}) => ({ slug: "elina", ready: true, authenticated: true, ownerId: "member-1", getAccessToken: async () => "token", ...over });
const tagged = "?locale=en&utm_source=telegram&utm_medium=community&utm_campaign=elina-onboarding-1117&utm_content=cgaa";
const properties = { source: "telegram", campaign: "elina-onboarding-1117", content: "cgaa" };

describe("event source tag recording", () => {
  beforeEach(() => { record.mockReset(); record.mockResolvedValue(true); window.sessionStorage.clear(); });
  afterEach(() => window.history.replaceState(null, "", "/"));

  it("records a signed-in member's tagged visit once, with only the tag as properties", async () => {
    window.history.replaceState(null, "", `/elina${tagged}`);
    renderHook(() => useEventSourceTag(props()));
    await waitFor(() => expect(record).toHaveBeenCalledTimes(1));
    expect(record.mock.calls[0][0]).toMatchObject({ eventName: "creator_page_view", source: "fan_event_source.identified", properties });
    expect(record.mock.calls[0][1]).toBe("token");
  });
  it("records nothing for a visitor who is not signed in, or for an untagged or invalid link", async () => {
    window.history.replaceState(null, "", `/elina${tagged}`);
    renderHook(() => useEventSourceTag(props({ authenticated: false })));
    window.history.replaceState(null, "", "/elina?locale=en&utm_source=telegram&utm_campaign=elina-onboarding-1117&utm_content=Kim%20Minsu");
    window.sessionStorage.clear();
    renderHook(() => useEventSourceTag(props()));
    window.history.replaceState(null, "", "/elina?locale=en");
    renderHook(() => useEventSourceTag(props()));
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(record).not.toHaveBeenCalled();
  });
  it("keeps the tag across the sign-in round trip, where the address has lost its UTM, and records it once", async () => {
    window.history.replaceState(null, "", `/elina${tagged}`);
    const signedOut = renderHook(() => useEventSourceTag(props({ authenticated: false, ownerId: null })));
    signedOut.unmount();
    window.history.replaceState(null, "", "/elina?locale=en");
    renderHook(() => useEventSourceTag(props()));
    await waitFor(() => expect(record).toHaveBeenCalledTimes(1));
    expect(record.mock.calls[0][0]).toMatchObject({ properties });
    renderHook(() => useEventSourceTag(props()));
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(record).toHaveBeenCalledTimes(1);
  });
  it("does not carry a stored tag to another fan page", async () => {
    window.history.replaceState(null, "", `/elina${tagged}`);
    renderHook(() => useEventSourceTag(props({ authenticated: false, ownerId: null })));
    window.history.replaceState(null, "", "/changha?locale=en");
    renderHook(() => useEventSourceTag(props({ slug: "changha" })));
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(record).not.toHaveBeenCalled();
  });
});
