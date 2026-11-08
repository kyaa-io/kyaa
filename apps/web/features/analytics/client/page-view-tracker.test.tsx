import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ pathname: "/community" }));
const record = vi.hoisted(() => vi.fn(async () => true));
const auth = vi.hoisted(() => ({ ready: true, authenticated: false, getAccessToken: vi.fn(async (): Promise<string | null> => "member-token") }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));
vi.mock("./product-event-client", () => ({ recordProductEventV1: record }));
vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => auth }));
import { PageViewTracker } from "./page-view-tracker";
import { clientProductEventV1Schema } from "../domain/product-event";

type Call = [Record<string, unknown>, string | null | undefined];
const calls = () => record.mock.calls as unknown as Call[];

beforeEach(() => {
  record.mockClear();
  auth.ready = true;
  auth.authenticated = false;
  window.sessionStorage.clear();
  navigation.pathname = "/community";
  window.history.replaceState(null, "", "/community?creator=elina&post=123&utm_medium=social");
});

describe("PageViewTracker", () => {
  it("records the session's first screen with its channel and later screens as internal, without the address", async () => {
    const view = render(<PageViewTracker />);
    await waitFor(() => expect(record).toHaveBeenCalledTimes(1));
    navigation.pathname = "/login";
    view.rerender(<PageViewTracker />);
    view.rerender(<PageViewTracker />);
    navigation.pathname = "/admin/traffic";
    view.rerender(<PageViewTracker />);
    await waitFor(() => expect(record).toHaveBeenCalledTimes(2));
    const [[first, firstToken], [second]] = calls();
    expect(first.properties).toMatchObject({ pageKind: "community", entry: true, channel: "social" });
    expect(second.properties).toMatchObject({ pageKind: "login", entry: false, channel: "internal" });
    expect(firstToken).toBeNull();
    for (const event of [first, second]) {
      expect(JSON.stringify(event)).not.toMatch(/elina|post|utm|\/community|\/login/);
      expect(clientProductEventV1Schema.safeParse({ ...event, schemaVersion: 1, anonymousSessionId: "session-000000000001", occurredAt: new Date().toISOString() }).success).toBe(true);
    }
  });

  it("does not count a reload of the same tab session as a new entry", async () => {
    window.sessionStorage.setItem("byus.page-view.entry.v1", "1");
    render(<PageViewTracker />);
    await waitFor(() => expect(record).toHaveBeenCalledTimes(1));
    expect(calls()[0][0].properties).toMatchObject({ entry: false, channel: "internal" });
  });

  it("waits for the session, then records a signed-in screen as the member's, and signing in keeps the tab one visit", async () => {
    auth.ready = false;
    const view = render(<PageViewTracker />);
    expect(record).not.toHaveBeenCalled();
    auth.ready = true;
    view.rerender(<PageViewTracker />);
    await waitFor(() => expect(record).toHaveBeenCalledTimes(1));
    expect(calls()[0][1]).toBeNull();
    auth.authenticated = true;
    navigation.pathname = "/my";
    view.rerender(<PageViewTracker />);
    await waitFor(() => expect(record).toHaveBeenCalledTimes(2));
    expect(calls()[1][1]).toBe("member-token");
    expect(calls().map(([event]) => (event.properties as { entry: boolean }).entry)).toEqual([true, false]);
  });
});
