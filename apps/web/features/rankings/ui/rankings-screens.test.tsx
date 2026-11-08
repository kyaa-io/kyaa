import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { CreatorRankingScreen } from "./rankings-screens";

const urls = vi.hoisted(() => [] as string[]);
vi.mock("./use-ranking-resource", () => ({
  useRankingResource: (url: string, parse: (v: unknown) => unknown) => {
    urls.push(url);
    const fans = { period: "week", periodStart: "2026-11-02", computedAt: null, rows: [{ rank: 1, score: 12, nickname: "하트팬", characterId: "c1", tier: "Gold", isMe: false }], me: null };
    const creators = { period: "week", periodStart: "2026-11-02", computedAt: null, rows: [{ rank: 1, slug: "elina", name: "엘리나", imageUrl: null, score: 30, jjinfanCount: 0, myHearts: null }] };
    return { state: { status: "ready", data: parse(url.startsWith("/api/rankings/fans") ? fans : creators) }, retry: () => {} };
  },
}));

beforeEach(() => { urls.length = 0; });

it("opens on the platform fan ranking the home card's fan tab shows, from the same endpoint", async () => {
  render(<CreatorRankingScreen locale="ko" />);
  expect(await screen.findByRole("tab", { name: "팬 랭킹" })).toHaveAttribute("aria-selected", "true");
  expect(urls.some((url) => url.startsWith("/api/rankings/fans?period=week"))).toBe(true);
  expect(await screen.findByText("하트팬")).toBeInTheDocument();
});

it("switches to the creator ranking, and opens on it when asked", async () => {
  const { unmount } = render(<CreatorRankingScreen locale="ko" />);
  fireEvent.click(await screen.findByRole("tab", { name: "크리에이터 랭킹" }));
  expect(await screen.findByText("엘리나")).toBeInTheDocument();
  unmount();
  render(<CreatorRankingScreen locale="ko" initialTab="creators" />);
  expect(await screen.findByRole("tab", { name: "크리에이터 랭킹" })).toHaveAttribute("aria-selected", "true");
});

it("opens on the period the home card's segment asked for (이번 주 → week, 전체 → all)", async () => {
  render(<CreatorRankingScreen locale="ko" initialPeriod="all" />);
  expect(await screen.findByText("하트팬")).toBeInTheDocument();
  expect(urls.some((url) => url.startsWith("/api/rankings/fans?period=all"))).toBe(true);
  expect(urls.some((url) => url.startsWith("/api/rankings/fans?period=week"))).toBe(false);
});
