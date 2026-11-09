import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WebAnalyticsData } from "../domain/web-analytics";
import type { AcquisitionAnalyticsData } from "../domain/acquisition-analytics";
import type { OutboundAnalyticsData } from "../domain/outbound-analytics";
import type { FunnelAnalyticsData } from "../domain/funnel-analytics";
import type { WeeklyMetricsData } from "../domain/weekly-metrics";

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
const monday = (n: number, plusDays = 0) => new Date(Date.UTC(2026, 8, 7 + n * 7 + plusDays)).toISOString().slice(0, 10);
const weeklyData: WeeklyMetricsData = {
  timezone: "Asia/Seoul", from: "2026-09-06T15:00:00Z", to: "2026-11-08T15:00:00Z",
  weeks: Array.from({ length: 8 }, (_, n) => ({
    weekStart: monday(n), weekEnd: monday(n, 6), inProgress: n === 7,
    signups: 10 + n, activeMembers: 100 + n, posts: 20 + n, comments: 30 + n, pointsGranted: 1000 * (n + 1), heartsGranted: n, cumulativeSignups: 2000 + n * 100,
  })),
};
const response = (payload: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(payload), { status }));
const analyticsResponse = (url: string, web = data) => url.includes("/weekly") ? response(weeklyData) : url.includes("/outbound")
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
  it("shows the last eight weeks newest first with the share of the 3,000 goal and downloads the same columns as CSV", async () => {
    vi.stubGlobal("fetch", vi.fn((url: string) => analyticsResponse(url)));
    const created: Blob[] = [];
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: (blob: Blob) => { created.push(blob); return "blob:weekly"; }, revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<WebAnalyticsDashboard />);
    const weekly = await screen.findByRole("region", { name: "주간 지표 최근 8주" });
    const rows = within(weekly).getAllByRole("row").map((row) => row.textContent);
    expect(rows).toHaveLength(9);
    expect(rows[0]).toBe("주 (월~일)가입주간 활성글댓글포인트 지급하트 지급누적 가입");
    expect(rows[1]).toBe("10/26 – 11/01집계 중1710727378,00072,7003,000명 중 90.0%");
    expect(rows[8]).toBe("09/07 – 09/131010020301,00002,0003,000명 중 66.7%");
    fireEvent.click(screen.getByRole("button", { name: "CSV 내려받기" }));
    expect(click).toHaveBeenCalledTimes(1);
    expect(created).toHaveLength(1);
    const read = <T,>(load: (reader: FileReader) => void) => new Promise<T>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result as T); load(reader); });
    expect([...new Uint8Array(await read<ArrayBuffer>((reader) => reader.readAsArrayBuffer(created[0]!))).slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const csv = await read<string>((reader) => reader.readAsText(created[0]!));
    expect(csv.split("\r\n")[0]).toBe("주 (월~일),가입,주간 활성,글,댓글,포인트 지급,하트 지급,누적 가입,목표 3000명 대비 %");
    expect(csv.split("\r\n")[8]).toBe("2026-10-26~2026-11-01,17,107,27,37,8000,7,2700,90");
    click.mockRestore();
  });
  it("shows a weekly error without hiding the other reports", async () => {
    vi.stubGlobal("fetch", vi.fn((url: string) => url.includes("/weekly") ? response({ error: { code: "WEEKLY_METRICS_UNAVAILABLE" } }, 503) : analyticsResponse(url)));
    render(<WebAnalyticsDashboard />);
    expect(await screen.findByText("주간 지표를 불러오지 못했습니다")).toBeInTheDocument();
    await screen.findByText("팬 가이드");
    expect(screen.getByRole("region", { name: "가입 퍼널 단계" })).toBeInTheDocument();
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
