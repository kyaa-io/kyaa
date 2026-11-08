import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ pathname: "/community" }));
const record = vi.hoisted(() => vi.fn(async () => true));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));
vi.mock("./product-event-client", () => ({ recordProductEventV1: record }));
import { PageViewTracker } from "./page-view-tracker";
import { clientProductEventV1Schema } from "../domain/product-event";

beforeEach(() => {
  record.mockClear();
  window.sessionStorage.clear();
  navigation.pathname = "/community";
  window.history.replaceState(null, "", "/community?creator=elina&post=123&utm_medium=social");
});

describe("PageViewTracker", () => {
  it("records the session's first screen with its channel and later screens as internal, without the address", () => {
    const view = render(<PageViewTracker />);
    navigation.pathname = "/login";
    view.rerender(<PageViewTracker />);
    view.rerender(<PageViewTracker />);
    navigation.pathname = "/admin/traffic";
    view.rerender(<PageViewTracker />);
    expect(record).toHaveBeenCalledTimes(2);
    const [first, second] = record.mock.calls.map((call) => (call as unknown[])[0] as Record<string, unknown>);
    expect(first.properties).toMatchObject({ pageKind: "community", entry: true, channel: "social" });
    expect(second.properties).toMatchObject({ pageKind: "login", entry: false, channel: "internal" });
    expect(record.mock.calls.every((call) => (call as unknown[]).length === 1)).toBe(true);
    for (const event of [first, second]) {
      expect(JSON.stringify(event)).not.toMatch(/elina|post|utm|\/community|\/login/);
      expect(clientProductEventV1Schema.safeParse({ ...event, schemaVersion: 1, anonymousSessionId: "session-000000000001", occurredAt: new Date().toISOString() }).success).toBe(true);
    }
  });
  it("does not count a reload of the same tab session as a new entry", () => {
    window.sessionStorage.setItem("byus.page-view.entry.v1", "1");
    render(<PageViewTracker />);
    expect(((record.mock.calls[0] as unknown[])[0] as { properties: Record<string, unknown> }).properties).toMatchObject({ entry: false, channel: "internal" });
  });
});
