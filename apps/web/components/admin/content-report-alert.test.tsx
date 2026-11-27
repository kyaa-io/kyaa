import "@testing-library/jest-dom/vitest";
import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ContentReportAlert } from "./content-report-alert";
const retry = vi.fn();
let refreshFailed = false;
vi.mock("@/features/auth/client/auth-fallback", () => ({ usePrivy: () => ({}) }));
vi.mock("../fan-ui/use-owned-fan-resource", () => ({ useOwnedFanResource: () => ({ retry, refreshFailed, state: { status: "ready", data: { openCount: 3, overdueCount: 1, oldestDueAt: null } } }) }));
afterEach(() => { vi.useRealTimers(); retry.mockClear(); refreshFailed = false; });
it("shows pending and overdue reports and refreshes on focus and each minute", () => {
  vi.useFakeTimers();
  const { unmount } = render(<ContentReportAlert locale="ko" />);
  expect(screen.getByRole("link", { name: "처리할 신고 3건 · 기한 지남 1건" })).toHaveAttribute("href", "/admin/content-reports");
  act(() => { window.dispatchEvent(new Event("focus")); vi.advanceTimersByTime(60_000); });
  expect(retry).toHaveBeenCalledTimes(2);
  unmount();
  act(() => { window.dispatchEvent(new Event("focus")); vi.advanceTimersByTime(60_000); });
  expect(retry).toHaveBeenCalledTimes(2);
});
it("does not present stale notification counts as current", () => {
  refreshFailed = true;
  render(<ContentReportAlert locale="ko" />);
  expect(screen.getByRole("link", { name: "신고 수를 불러오지 못했어요" })).toBeInTheDocument();
});
