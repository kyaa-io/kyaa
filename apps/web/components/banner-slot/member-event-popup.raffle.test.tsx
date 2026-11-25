import type { ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ pathname: "/", authenticated: true, ownerKey: "member-1:0", request: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("@/components/locale-provider", () => ({ useAppLocale: () => ({ locale: "ko" }) }));
vi.mock("@/features/groups/ui/use-group-resource", () => ({
  useGroupRequest: () => ({ ready: true, authenticated: state.authenticated, ownerKey: state.ownerKey, request: state.request }),
}));
vi.mock("@/features/groups/ui/page-notice-modal", () => ({
  pageNoticeBlocked: () => false,
  PageNoticeDialog: ({ title, actionLabel, actionHref, secondary, onClose }: { title: string; actionLabel: string; actionHref: string; secondary?: ReactNode; onClose: () => void }) =>
    <div role="dialog" aria-label={title}><a href={actionHref}>{actionLabel}</a><button onClick={onClose}>닫기</button>{secondary}</div>,
}));
import { MemberEventPopup } from "./member-event-popup";

const popupCalls = () => state.request.mock.calls.filter(([url]) => url === "/api/signup-event/popup");
const tick = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

beforeEach(() => {
  vi.useFakeTimers();
  state.pathname = "/"; state.authenticated = true; state.ownerKey = "member-1:0";
  state.request.mockReset();
  state.request.mockImplementation(async (url: string) => url === "/api/signup-event/popup" ? { show: true } : { slots: {} });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ slots: {} }), { status: 200 })));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it("shows the raffle notice once to a signed-in member and leads straight to entering", async () => {
  render(<MemberEventPopup />);
  await tick(50); await tick(1100);
  expect(popupCalls()).toEqual([["/api/signup-event/popup", { method: "POST" }]]);
  expect(screen.getByRole("dialog").querySelector("a")?.getAttribute("href")).toBe("/s/raffle?enter=1&locale=ko");
  fireEvent.click(screen.getByRole("button", { name: "다시 보지 않기" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  await tick(5000);
  expect(popupCalls()).toHaveLength(1);
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("stays closed when the server says the member already entered or has seen it", async () => {
  state.request.mockImplementation(async (url: string) => url === "/api/signup-event/popup" ? { show: false } : { slots: {} });
  render(<MemberEventPopup />);
  await tick(50); await tick(1100);
  expect(popupCalls()).toHaveLength(1);
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("asks nothing for a guest or outside the home and groups entry screens", async () => {
  state.authenticated = false; state.ownerKey = "guest:0";
  const guest = render(<MemberEventPopup />);
  await tick(2100);
  guest.unmount();
  state.authenticated = true; state.ownerKey = "member-1:0"; state.pathname = "/ranking";
  render(<MemberEventPopup />);
  await tick(2100);
  expect(popupCalls()).toHaveLength(0);
});
