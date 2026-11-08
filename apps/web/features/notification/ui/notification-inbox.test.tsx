import { render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/notifications", useSearchParams: () => new URLSearchParams() }));
import { NotificationInbox } from "./notification-inbox";

it("keeps a long favorite name whole for the chip's name and title while the chip cuts it visually", () => {
  const name = "[시험] 랭킹 확인 페이지 이름이 아주 긴 최애";
  const inbox = { state: { kind: "ready" as const, items: [] }, unread: 0, reload: vi.fn(), markRead: vi.fn(), readAll: vi.fn(), readingAll: false };
  render(<NotificationInbox locale="ko" inbox={inbox} favoriteName={name} returnTo="/notifications" />);
  const chips = screen.getByRole("navigation", { name: "알림 종류" });
  const favorite = within(chips).getByRole("button", { name });
  expect(favorite.querySelector(`[title="${name}"]`)?.className).toMatch(/chipName/);
  expect(chips.className).toMatch(/kindFilter/);
});

it("VISUAL-K ①: signed out, the inbox is the line and the sign-in action only — no chips, no settings gear, no locked rows", () => {
  const inbox = { state: { kind: "auth" as const }, unread: 0, reload: vi.fn(), markRead: vi.fn(), readAll: vi.fn(), readingAll: false };
  const { container } = render(<NotificationInbox locale="ko" inbox={inbox as never} returnTo="/" />);
  expect(screen.getByText("로그인하면 받은 알림이 여기에 쌓입니다.")).toBeVisible();
  expect(screen.queryByRole("navigation", { name: "알림 종류" })).toBeNull();
  expect(screen.queryByRole("link", { name: "알림 설정" })).toBeNull();
  expect(container.querySelector("[data-locked-rows], [data-fan-locked]")).toBeNull();
  expect(container.querySelectorAll("a, button").length).toBeGreaterThan(0);
});
