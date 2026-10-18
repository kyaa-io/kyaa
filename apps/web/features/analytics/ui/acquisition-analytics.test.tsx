import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AcquisitionAnalyticsData } from "../domain/acquisition-analytics";

const auth = vi.hoisted(() => ({ status: "authorized", email: "admin@example.invalid", getAccessToken: vi.fn(async (): Promise<string | null> => "admin-token") }));
vi.mock("@privy-io/react-auth", () => ({ usePrivy: () => ({ getAccessToken: auth.getAccessToken }) }));
vi.mock("../../../components/admin/use-admin-session", () => ({ useAdminSession: () => ({ status: auth.status, admin: { email: auth.email, role: "admin" } }) }));

import { AcquisitionAnalytics, AcquisitionAnalyticsContent } from "./acquisition-analytics";

const metric = (value: number) => ({ state: "available" as const, value, reason: null, source: "fan_product_events" });
const hidden = { state: "suppressed" as const, value: null, reason: "SMALL_COHORT_LT_5" as const, source: "fan_product_events" };
const counts = { acquisitions: metric(15), accountCreated: metric(5), profileCompleted: hidden, reservationCompleted: metric(0), benefitEntered: metric(10) };
const data: AcquisitionAnalyticsData = {
  days: 7, from: "2026-10-12T00:00:00Z", to: "2026-10-18T07:00:00Z", totals: counts,
  rows: [{ channel: "search", landing: "benefit", ...counts }],
};
const response = (payload: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(payload), { status }));

beforeEach(() => {
  auth.status = "authorized";
  auth.email = "admin@example.invalid";
  auth.getAccessToken.mockReset().mockResolvedValue("admin-token");
});

describe("AcquisitionAnalyticsContent", () => {
  it("shows safe dimensions, measured zero, suppression and independent period semantics", () => {
    render(<AcquisitionAnalyticsContent data={data} locale="ko" />);
    const table = screen.getByRole("region", { name: "유입 후 회원 전환 상세 목록" });
    expect(within(table).getByText("검색")).toBeInTheDocument();
    expect(within(table).getByText("혜택·선물")).toBeInTheDocument();
    expect(within(table).getAllByText("비공개")).toHaveLength(2);
    expect(within(table).getAllByText("0")).toHaveLength(2);
    expect(screen.getByText(/신규 회원 수가 아니며 이전 방문 이력은 제외 조건이 아닙니다/)).toBeInTheDocument();
    expect(screen.getByText(/익명 방문과 회원을 연결하지 않습니다/)).toBeInTheDocument();
  });
  it("renders English empty state", () => {
    render(<AcquisitionAnalyticsContent data={{ ...data, rows: [] }} locale="en" />);
    expect(screen.getByText("No identified acquisitions were recorded in this period.")).toBeInTheDocument();
  });
});

describe("AcquisitionAnalytics", () => {
  it("requests the shared period with admin authentication and refreshes on demand", async () => {
    const fetcher = vi.fn((url: string) => response({ ...data, days: url.includes("days=30") ? 30 : 7 }));
    vi.stubGlobal("fetch", fetcher);
    const view = render(<AcquisitionAnalytics days={7} refresh={0} locale="ko" />);
    await screen.findByText("검색");
    expect(fetcher).toHaveBeenCalledWith("/api/admin/analytics/acquisition?days=7", expect.objectContaining({ headers: { authorization: "Bearer admin-token" }, cache: "no-store", signal: expect.any(AbortSignal) }));
    view.rerender(<AcquisitionAnalytics days={30} refresh={1} locale="ko" />);
    await waitFor(() => expect(fetcher).toHaveBeenCalledWith("/api/admin/analytics/acquisition?days=30", expect.anything()));
  });

  it("does not request denied sessions and reports API authorization rejection", async () => {
    auth.status = "denied";
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const view = render(<AcquisitionAnalytics days={7} refresh={0} locale="ko" />);
    expect(fetcher).not.toHaveBeenCalled();
    auth.status = "authorized";
    fetcher.mockImplementation(() => response({}, 403));
    view.rerender(<AcquisitionAnalytics days={7} refresh={0} locale="ko" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("이 집계를 볼 권한이 없습니다.");
  });

  it.each([401, 503] as const)("shows session and unavailable errors (%i)", async status => {
    vi.stubGlobal("fetch", vi.fn(() => response({}, status)));
    render(<AcquisitionAnalytics days={7} refresh={0} locale="en" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(status === 401 ? "Your admin session has expired." : "Refresh to try again.");
  });

  it("hides the previous owner's rows while the next request is pending", async () => {
    const fetcher = vi.fn().mockImplementationOnce(() => response(data)).mockImplementation(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetcher);
    const view = render(<AcquisitionAnalytics days={7} refresh={0} locale="ko" />);
    await screen.findByText("검색");
    auth.email = "other@example.invalid";
    view.rerender(<AcquisitionAnalytics days={7} refresh={0} locale="ko" />);
    expect(screen.queryByText("검색")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
