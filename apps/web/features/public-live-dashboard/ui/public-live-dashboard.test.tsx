import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { APP_LOCALES } from "@/i18n/locales";
import { publicLiveDashboardCopy } from "@/i18n/catalogs/features__public-live-dashboard";
import { parsePublicDashboard, type PublicDashboardData } from "../domain/public-live-dashboard";
import { PublicLiveDashboard, PublicLiveDashboardContent } from "./public-live-dashboard";

vi.mock("@/components/fan-shell/fan-app-shell", () => ({
  FanAppFrame: ({ children, locale }: { children: ReactNode; locale: string }) => <div lang={locale} data-app-frame>{children}</div>,
  FanContentContainer: ({ children, as: Tag = "div", ...props }: { children: ReactNode; as?: "main" | "div" }) => <Tag {...props}>{children}</Tag>,
}));
const data: PublicDashboardData = {
  database: { state: "available", approvedParticipation: 28, participatingBroadcasts: 4, sentHearts: 19, process: { pending: 3, approved: 9, rejected: 1 }, asOf: "2026-10-19T00:20:00Z" },
  onchain: { state: "available", asOf: "2026-10-19T00:15:00Z", blockTimestamp: "2026-10-19T00:12:00Z", metrics: { uniqueActiveWallets: 7, actionCounts: { 1: 10 }, passportCredentials: 11, mintedCredentials: 13, lifecycleTransactions: 29, currentActionTransactions: 17 } },
};
const missing = { database: { state: "unavailable" }, onchain: { state: "unavailable" } } satisfies PublicDashboardData;
const refresh = vi.fn();
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); refresh.mockClear(); });

describe("public LIVE dashboard", () => {
  it("keeps confirmed database totals when GIWA is unavailable, without fabricating zero", () => {
    render(<PublicLiveDashboardContent locale="en" data={{ ...data, onchain: { state: "unavailable" } }} pending={false} onRefresh={refresh} />);
    expect(screen.getByText("28")).toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "DB" })).getByText("Confirmed")).toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "GIWA" })).getByText("Check failed")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(4);
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh status" }));
    expect(refresh).toHaveBeenCalledOnce();
  });
  it("keeps confirmed GIWA counts independent of unavailable service data", () => {
    render(<PublicLiveDashboardContent locale="en" data={{ ...data, database: { state: "unavailable" } }} pending={false} onRefresh={refresh} />);
    expect(screen.getByText("17")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(3);
    expect(within(screen.getByRole("article", { name: "GIWA" })).getByText("Confirmed")).toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "DB" })).getByText("Check failed")).toBeInTheDocument();
    expect(screen.getByText(/do not represent onchain heart spending/)).toBeInTheDocument();
  });
  it("preserves true zero counts and uses a dash for unknown counts", () => {
    const database = { ...data.database, state: "available", approvedParticipation: 0, participatingBroadcasts: null, sentHearts: null, process: { pending: 0, approved: 0, rejected: 0 }, asOf: "2026-10-19T00:20:00Z" } as const;
    render(<PublicLiveDashboardContent locale="en" data={{ ...missing, database }} pending={false} onRefresh={refresh} />);
    expect(screen.getAllByText("0")).toHaveLength(4);
    expect(screen.getAllByText("—")).toHaveLength(6);
  });
  it("shows both sources as checking while loading, and disables duplicate refreshes", () => {
    render(<PublicLiveDashboardContent locale="en" data={missing} pending onRefresh={refresh} />);
    expect(screen.getAllByText("Checking", { exact: true })).toHaveLength(2);
    expect(screen.queryByText("Check failed")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh status" })).toBeDisabled();
  });
  it("labels collection and finalized-block timestamps separately in KST", () => {
    render(<PublicLiveDashboardContent locale="en" data={data} pending={false} onRefresh={refresh} />);
    const chain = screen.getByRole("article", { name: "GIWA" });
    expect(within(chain).getByText(/Finalized block time/)).toHaveTextContent("9:12 AM KST");
    expect(within(chain).getByText(/Measured at/)).toHaveTextContent("9:15 AM KST");
    expect(chain.querySelector('time[datetime="2026-10-19T00:12:00Z"]')).toBeInTheDocument();
  });
  it("validates source payloads independently and rejects private or malformed source fields", () => {
    const parsed = parsePublicDashboard({ ...data, database: { ...data.database, memberId: "private" } });
    expect(parsed.database).toEqual({ state: "unavailable" });
    expect(parsed.onchain).toEqual(data.onchain);
    const invalid = parsePublicDashboard({ ...data, onchain: { ...data.onchain, blockTimestamp: "unknown" } });
    expect(invalid.database).toEqual(data.database);
    expect(invalid.onchain).toEqual({ state: "unavailable" });
  });
  it("fetches publicly without credentials and allows manual retry after a failed read", async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error("Offline")).mockResolvedValueOnce({ ok: true, json: async () => data });
    vi.stubGlobal("fetch", fetcher);
    render(<PublicLiveDashboard locale="en" />);
    await waitFor(() => expect(screen.getAllByText("Check failed")).toHaveLength(2));
    expect(fetcher).toHaveBeenCalledWith("/api/public/live-dashboard", expect.objectContaining({ credentials: "omit", cache: "no-store", headers: { Accept: "application/json" } }));
    fireEvent.click(screen.getByRole("button", { name: "Refresh status" }));
    await waitFor(() => expect(screen.getByText("28")).toBeInTheDocument());
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(document.querySelectorAll("[data-app-frame]")).toHaveLength(1);
  });
  it.each(APP_LOCALES)("renders meaningful copy and dates for %s", locale => {
    render(<PublicLiveDashboardContent locale={locale} data={data} pending={false} onRefresh={refresh} />);
    const copy = publicLiveDashboardCopy(locale);
    expect(screen.getByRole("heading", { level: 1, name: copy.heading })).toBeInTheDocument();
    expect(Object.values(copy).every(value => typeof value === "string" && value.length > 0)).toBe(true);
    expect(screen.getByRole("button", { name: copy.refresh })).toBeEnabled();
    expect(document.querySelectorAll("time")).toHaveLength(3);
  });
});
