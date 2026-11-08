import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WebAnalyticsData } from "../domain/web-analytics";
import type { AcquisitionAnalyticsData } from "../domain/acquisition-analytics";
import type { OutboundAnalyticsData } from "../domain/outbound-analytics";
import type { FunnelAnalyticsData } from "../domain/funnel-analytics";

const auth = vi.hoisted(() => ({ status: "authorized", email: "admin@example.invalid", getAccessToken: vi.fn(async (): Promise<string | null> => "admin-token") }));
vi.mock("@privy-io/react-auth", () => ({ usePrivy: () => ({ getAccessToken: auth.getAccessToken }) }));
vi.mock("../../../components/admin/use-admin-session", () => ({ useAdminSession: () => ({ status: auth.status, admin: { email: auth.email, role: "admin" } }) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/admin/traffic", useSearchParams: () => new URLSearchParams(), useRouter: () => ({ replace: vi.fn() }) }));
import { WebAnalyticsContent, WebAnalyticsDashboard } from "./web-analytics-dashboard";

const data: WebAnalyticsData = {
  days: 7, from: "2026-09-05T00:00:00Z", to: "2026-09-12T00:00:00Z", fetchedAt: "2026-09-11T23:00:00Z",
  totals: { visitors: 358, pageviews: 1386 }, trend: [{ date: "2026-09-11", visitors: 358, pageviews: 1386 }],
  breakdowns: {
    pages: [{ label: "fan_guide", visitors: 252, pageviews: 400 }],
    referrers: [{ label: "social", visitors: 233, pageviews: 600 }],
    devices: [{ label: "mobile", visitors: 337, pageviews: 1200 }],
    browsers: [], operatingSystems: [],
  },
};
const outboundData: OutboundAnalyticsData = {
  days: 7, from: "2026-09-05T00:00:00Z", to: "2026-09-12T00:00:00Z",
  totals: { clicks: 12, sessions: 9 },
  rows: [{ campaign: "runmusic", destinationHost: "wgrw.raceplan.co.kr", placement: "fanpage_hero", linkKind: "ticket", clicks: 12, sessions: 9 }],
  truncated: false,
};
const acquisitionMetric = (value: number) => ({ state: "available" as const, value, reason: null, source: "fan_product_events" });
const acquisitionData: AcquisitionAnalyticsData = {
  days: 7, from: "2026-09-05T00:00:00Z", to: "2026-09-12T00:00:00Z", rows: [],
  totals: { acquisitions: acquisitionMetric(0), accountCreated: acquisitionMetric(0), profileCompleted: acquisitionMetric(0), reservationCompleted: acquisitionMetric(0), benefitEntered: acquisitionMetric(0) },
};
const funnelData: FunnelAnalyticsData = {
  days: 7, from: "2026-09-05T00:00:00Z", to: "2026-09-12T00:00:00Z", pageViewsSince: "2026-09-08T03:00:00Z",
  steps: { visitors: 400, accountCreated: 20, fanVerified: 10, firstActivity: 4 },
  visitedMembers: { visited: 30, accountCreated: 12, fanVerified: 6, firstActivity: 3 },
};
const response = (payload: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(payload), { status }));
const analyticsResponse = (url: string, web = data) => url.includes("/outbound")
  ? response({ ...outboundData, days: url.includes("days=30") ? 30 : 7 })
  : url.includes("/funnel")
    ? response({ ...funnelData, days: url.includes("days=30") ? 30 : 7 })
  : url.includes("/acquisition")
    ? response({ ...acquisitionData, days: url.includes("days=30") ? 30 : 7 })
    : response({ ...web, days: url.includes("days=30") ? 30 : 7 });
beforeEach(() => { auth.status = "authorized"; auth.email = "admin@example.invalid"; auth.getAccessToken.mockReset().mockResolvedValue("admin-token"); });

describe("WebAnalyticsContent", () => {
  it("switches the trend metric and keeps source values and member distinction visible", () => {
    render(<WebAnalyticsContent data={data} />);
    expect(screen.getByRole("img", { name: /^방문자/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /페이지뷰/ }));
    expect(screen.getByRole("img", { name: /^페이지뷰/ })).toBeInTheDocument();
    expect(screen.getByText("소셜")).toBeInTheDocument();
    expect(screen.getByText("모바일")).toBeInTheDocument();
    expect(screen.getByText(/회원 수와 다릅니다/)).toBeInTheDocument();
    expect(screen.queryByText(/Vercel/)).not.toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "인기 페이지" })).getByText("252")).toBeInTheDocument();
  });
  it("renders English labels and a truthful empty state", () => {
    render(<WebAnalyticsContent data={data} locale="en" />);
    expect(screen.getByRole("region", { name: "Operating systems" })).toHaveTextContent("No visits recorded");
    expect(screen.getByText("Fan guide")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Visitors/ })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("WebAnalyticsDashboard", () => {
  it("requests authenticated analytics and applies the selected period", async () => {
    const fetcher = vi.fn().mockImplementation((url: string) => analyticsResponse(url));
    vi.stubGlobal("fetch", fetcher);
    render(<WebAnalyticsDashboard />);
    await screen.findByText("팬 가이드");
    expect(fetcher).toHaveBeenCalledWith("/api/admin/analytics/web?days=7", expect.objectContaining({ headers: { authorization: "Bearer admin-token" }, cache: "no-store" }));
    expect(fetcher).toHaveBeenCalledWith("/api/admin/analytics/outbound?days=7", expect.objectContaining({ headers: { authorization: "Bearer admin-token" }, cache: "no-store" }));
    expect(fetcher).toHaveBeenCalledWith("/api/admin/analytics/acquisition?days=7", expect.objectContaining({ cache: "no-store" }));
    expect(fetcher).toHaveBeenCalledWith("/api/admin/analytics/funnel?days=7", expect.objectContaining({ headers: { authorization: "Bearer admin-token" }, cache: "no-store" }));
    const funnel = await screen.findByRole("region", { name: "가입 퍼널 단계" });
    expect(within(funnel).getByText("9월 8일부터 수집")).toBeInTheDocument();
    expect(within(funnel).getAllByRole("row").map((row) => row.textContent)).toEqual([
      "단계수이전 단계 대비방문 회원 중", "방문 세션9월 8일부터 수집400—30", "가입20—12", "첫 팬 인증1050%6", "첫 활동440%3",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "최근 30일" }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledWith("/api/admin/analytics/web?days=30", expect.anything()));
    await waitFor(() => expect(fetcher).toHaveBeenCalledWith("/api/admin/analytics/outbound?days=30", expect.anything()));
    await waitFor(() => expect(fetcher).toHaveBeenCalledWith("/api/admin/analytics/acquisition?days=30", expect.anything()));
    await waitFor(() => expect(fetcher).toHaveBeenCalledWith("/api/admin/analytics/funnel?days=30", expect.anything()));
    await screen.findByText("팬 가이드");
  });
  it("never requests analytics when admin access is denied", () => {
    auth.status = "denied";
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    render(<WebAnalyticsDashboard />);
    expect(fetcher).not.toHaveBeenCalled();
    expect(screen.queryByText("팬 가이드")).not.toBeInTheDocument();
  });
  it("handles expired tokens without fetching and does not show data after access revocation", async () => {
    vi.stubGlobal("fetch", vi.fn((url: string) => analyticsResponse(url)));
    const view = render(<WebAnalyticsDashboard />);
    await screen.findByText("팬 가이드");
    auth.status = "denied"; view.rerender(<WebAnalyticsDashboard />);
    expect(screen.queryByText("팬 가이드")).not.toBeInTheDocument();
    auth.status = "authorized"; auth.getAccessToken.mockResolvedValue(null);
    view.rerender(<WebAnalyticsDashboard />);
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    expect(screen.queryByText("팬 가이드")).not.toBeInTheDocument();
  });
  it("shows an error instead of fabricated zeros and recovers on retry", async () => {
    vi.stubGlobal("fetch", vi.fn((url: string) => url.includes("/web?") ? response({ error: { code: "WEB_ANALYTICS_UNAVAILABLE" } }, 503) : analyticsResponse(url)));
    render(<WebAnalyticsDashboard />);
    await screen.findByRole("alert");
    expect(screen.queryByRole("img", { name: /^방문자/ })).not.toBeInTheDocument();
    expect(screen.getByText("wgrw.raceplan.co.kr")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    vi.mocked(fetch).mockImplementation((url: string | URL | Request) => analyticsResponse(String(url)));
    await screen.findByText("팬 가이드");
  });
  it("hides previous account data immediately while the next account request is pending", async () => {
    const fetcher = vi.fn((url: string) => auth.email === "admin@example.invalid" ? analyticsResponse(url) : new Promise(() => {}));
    vi.stubGlobal("fetch", fetcher);
    const view = render(<WebAnalyticsDashboard />);
    await screen.findByText("팬 가이드");
    auth.email = "other@example.invalid";
    view.rerender(<WebAnalyticsDashboard />);
    expect(screen.queryByText("팬 가이드")).not.toBeInTheDocument();
    expect(screen.getByText("방문 통계를 불러오고 있습니다.")).toBeInTheDocument();
    expect(screen.getByText("외부 링크 집계를 불러오고 있습니다.")).toBeInTheDocument();
  });
});
