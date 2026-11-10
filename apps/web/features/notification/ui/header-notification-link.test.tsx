import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ auth: { authenticated: true, ready: true }, resource: { state: { status: "loading" } as { status: string; data?: unknown } }, path: "" as string | null }));
vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => state.auth }));
const panel = vi.hoisted(() => ({ calls: [] as Array<{ open: boolean; anchor: unknown }> }));
vi.mock("./notification-panel", () => ({ NotificationPanel: ({ open, anchorRef }: { open: boolean; anchorRef: { current: unknown } }) => { panel.calls.push({ open, anchor: anchorRef }); return open ? <div data-testid="panel" /> : null; } }));
vi.mock("@/components/fan-ui/use-owned-fan-resource", () => ({ useOwnedFanResource: (path: string | null) => { state.path = path; return state.resource; } }));

import { HeaderNotificationLink, unreadBadgeText, unreadLabel } from "./header-notification-link";

beforeEach(() => { state.auth = { authenticated: true, ready: true }; state.resource = { state: { status: "loading" } }; });

it("shows 1–99 as is and more as 99+", () => {
  expect([1, 44, 99, 100, 1200].map(unreadBadgeText)).toEqual(["1", "44", "99", "99+", "99+"]);
});

it("puts the exact count in the accessible name in every language", () => {
  expect(unreadLabel("ko", "알림", 44)).toBe("알림, 안 읽은 알림 44개");
  expect(unreadLabel("en", "Notifications", 120)).toBe("Notifications, 120 unread");
  expect(unreadLabel("ja", "通知", 3)).toBe("通知, 未読3件");
  expect(unreadLabel("ko", "알림", 0)).toBe("알림");
});

it("reads the shared summary and draws the badge with the unread count (dev-fan-3 had 44)", () => {
  state.resource = { state: { status: "ready", data: { unreadNotificationCount: 44 } } };
  render(<HeaderNotificationLink locale="ko" label="알림" />);
  const link = screen.getByRole("button", { name: "알림, 안 읽은 알림 44개" });
  expect(link).toHaveAttribute("aria-haspopup", "dialog");
  expect(link).toHaveTextContent("44");
  expect(state.path).toBe("/api/me/summary?locale=ko&tierStages=1&hearts=1&gifts=1");
});

it("draws 99+ past 99 and no badge at 0, signed out or loading", () => {
  state.resource = { state: { status: "ready", data: { unreadNotificationCount: 135 } } };
  const { rerender } = render(<HeaderNotificationLink locale="ko" label="알림" />);
  expect(screen.getByRole("button")).toHaveTextContent("99+");
  expect(screen.getByRole("button")).toHaveAccessibleName("알림, 안 읽은 알림 135개");
  state.resource = { state: { status: "ready", data: { unreadNotificationCount: 0 } } };
  rerender(<HeaderNotificationLink locale="ko" label="알림" />);
  expect(screen.getByRole("button", { name: "알림" })).toHaveTextContent("");
  state.auth = { authenticated: false, ready: true }; state.resource = { state: { status: "idle" } };
  rerender(<HeaderNotificationLink locale="ko" label="알림" />);
  expect(state.path).toBeNull();
  expect(screen.getByRole("button", { name: "알림" })).toHaveTextContent("");
});

it("the 4차 bell opens and closes the inbox panel, anchored on one ref for the bell's life", () => {
  panel.calls.length = 0;
  state.resource = { state: { status: "ready", data: { unreadNotificationCount: 2 } } };
  render(<HeaderNotificationLink locale="ko" label="알림" />);
  const bell = screen.getByRole("button", { name: "알림, 안 읽은 알림 2개" });
  expect(bell).toHaveTextContent("2");
  expect(bell).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByTestId("panel")).toBeNull();
  fireEvent.click(bell);
  expect(bell).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByTestId("panel")).toBeInTheDocument();
  expect((panel.calls.at(-1)!.anchor as { current: unknown }).current).toBe(bell);
  expect(new Set(panel.calls.map((call) => call.anchor)).size).toBe(1);
  fireEvent.click(bell);
  expect(screen.queryByTestId("panel")).toBeNull();
});
