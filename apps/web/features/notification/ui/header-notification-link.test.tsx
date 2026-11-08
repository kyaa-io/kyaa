import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ auth: { authenticated: true, ready: true }, resource: { state: { status: "loading" } as { status: string; data?: unknown } }, path: "" as string | null }));
vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => state.auth }));
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
  const link = screen.getByRole("link", { name: "알림, 안 읽은 알림 44개" });
  expect(link).toHaveAttribute("href", "/notifications?locale=ko");
  expect(link).toHaveTextContent("44");
  expect(state.path).toBe("/api/me/summary?locale=ko&tierStages=1&hearts=1");
});

it("draws 99+ past 99 and no badge at 0, signed out or loading", () => {
  state.resource = { state: { status: "ready", data: { unreadNotificationCount: 135 } } };
  const { rerender } = render(<HeaderNotificationLink locale="ko" label="알림" />);
  expect(screen.getByRole("link")).toHaveTextContent("99+");
  expect(screen.getByRole("link")).toHaveAccessibleName("알림, 안 읽은 알림 135개");
  state.resource = { state: { status: "ready", data: { unreadNotificationCount: 0 } } };
  rerender(<HeaderNotificationLink locale="ko" label="알림" />);
  expect(screen.getByRole("link", { name: "알림" })).toHaveTextContent("");
  state.auth = { authenticated: false, ready: true }; state.resource = { state: { status: "idle" } };
  rerender(<HeaderNotificationLink locale="ko" label="알림" />);
  expect(state.path).toBeNull();
  expect(screen.getByRole("link", { name: "알림" })).toHaveTextContent("");
});
