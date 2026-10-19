import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FavoriteSupportRankings } from "./favorite-support-rankings";
import { notifyFanActivityUpdated } from "@/components/fan-ui/fan-activity-updates";
import { APP_LOCALES } from "@/i18n/locales";
import { favoriteSupportRankingsCopy } from "@/i18n/catalogs/features__favorite-support-rankings";
const auth = { ready: true, authenticated: true, user: { id: "owner" }, getAccessToken: async () => "token" };
const session = { ready: true, ownerId: "owner", generation: 0 };
vi.mock("@privy-io/react-auth", () => ({ usePrivy: () => auth }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => session }));
vi.mock("@/components/fan-ui/creator-avatar", () => ({ CreatorAvatar: () => null }));
const item = { rank: 3, celebrityId: "11111111-1111-4111-8111-111111111111", celebritySlug: "kara", name: "KARA", imageUrl: null, supportUnits: 12540, supportKrw: 1254000 };
const fetcher = vi.fn(async () => Response.json({ items: [item], nextOffset: 20 }));
beforeEach(() => { auth.ready = true; auth.authenticated = true; auth.user = { id: "owner" }; session.ready = true; session.ownerId = "owner"; session.generation = 0; fetcher.mockReset(); fetcher.mockResolvedValue(Response.json({ items: [item], nextOffset: 20 })); vi.stubGlobal("fetch", fetcher); });
afterEach(() => vi.unstubAllGlobals());

describe("favorite support rankings", () => {
  it("keeps server ranks, full totals and overflow percentages while capping only the gauge", async () => {
    render(<FavoriteSupportRankings locale="ko" />);
    const gauge = await screen.findByRole("progressbar", { name: "KARA · 목표 달성률" });
    expect(gauge).toHaveAttribute("aria-valuenow", "100");
    expect(gauge).toHaveAttribute("aria-valuetext", "125.4%");
    expect(screen.getByText("12,540")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText(favoriteSupportRankingsCopy("ko").top)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "KARA · 하트 보내기" })).toHaveAttribute("href", "/support?locale=ko&creator=kara");
    expect(fetcher).toHaveBeenCalledWith("/api/me/mobile-fan-economy/support/rankings?locale=ko&limit=20&offset=0", expect.objectContaining({ cache: "no-store" }));
  });
  it("waits for session readiness and offers login without fetching as a guest", () => {
    session.ready = false;
    const view = render(<FavoriteSupportRankings locale="ko" />);
    expect(screen.getByText("불러오는 중이에요")).toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();
    session.ready = true; auth.authenticated = false;
    view.rerender(<FavoriteSupportRankings locale="ko" />);
    expect(screen.getByRole("link", { name: "로그인" })).toHaveAttribute("href", "/login?locale=ko&returnTo=%2Fcelebrities%3Flocale%3Dko");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("shows an honest empty state and retries failed reads", async () => {
    fetcher.mockResolvedValueOnce(new Response(null, { status: 503 })).mockResolvedValueOnce(Response.json({ items: [], nextOffset: null }));
    render(<FavoriteSupportRankings locale="en" />);
    fireEvent.click(await screen.findByRole("button", { name: "Check again" }));
    expect(await screen.findByText(favoriteSupportRankingsCopy("en").empty)).toBeInTheDocument();
  });
  it("hides a previous owner's rankings immediately when the owner changes", async () => {
    const view = render(<FavoriteSupportRankings locale="ko" />);
    await screen.findByText("KARA");
    fetcher.mockImplementation(() => new Promise<Response>(() => {}));
    session.ownerId = "another-owner"; session.generation += 1;
    view.rerender(<FavoriteSupportRankings locale="ko" />);
    expect(screen.queryByText("KARA")).not.toBeInTheDocument();
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  });
  it("discloses stale rankings after a failed background refresh", async () => {
    render(<FavoriteSupportRankings locale="ko" />);
    await screen.findByText("KARA");
    fetcher.mockResolvedValueOnce(new Response(null, { status: 503 }));
    act(() => notifyFanActivityUpdated("owner"));
    expect(await screen.findByText(favoriteSupportRankingsCopy("ko").stale)).toBeInTheDocument();
    expect(screen.getByText("KARA")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다시 확인" })).toBeInTheDocument();
  });
  it("supplies complete copy for all app locales", () => {
    for (const locale of APP_LOCALES) {
      const copy = favoriteSupportRankingsCopy(locale);
      expect(Object.values(copy)).toHaveLength(8);
      for (const value of Object.values(copy)) expect(value.trim().length).toBeGreaterThan(0);
    }
  });
});
