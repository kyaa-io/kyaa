import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ value: { ready: true, authenticated: false, user: null as null | { id: string }, getAccessToken: async () => "t" } }));
vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => auth.value }));

import { clearResources } from "@/components/fan-ui/resource-cache";
import { HomeRankingCard, resetHomeRankingTab } from "./home-ranking-card";

const fans = (me: unknown = null) => ({ period: "week", periodStart: "2026-11-02", computedAt: "2026-11-07T00:00:00Z", me, rows: [
  { rank: 1, score: 12, nickname: "별빛", characterId: "star-pink", tier: "Gold", isMe: false },
  { rank: 2, score: 3, nickname: "나", characterId: "fairy-pink", tier: null, isMe: true },
] });
const creators = { period: "week", periodStart: "1970-01-01", computedAt: null, metric: "fans", rows: [{ rank: 1, slug: "elina", name: "엘리나", imageUrl: null, score: 136, jjinfanCount: 1, myHearts: null }] };

afterEach(() => { vi.unstubAllGlobals(); clearResources(); resetHomeRankingTab(); });

function stub(fanBody: unknown) {
  const fetcher = vi.fn(async (input: string | URL | Request) => Response.json(String(input).startsWith("/api/rankings/fans") ? fanBody : creators));
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

it("lists fans with grade and hearts only, and asks a guest to sign in for their own rank", async () => {
  const fetcher = stub(fans());
  render(<HomeRankingCard locale="ko" />);
  const list = (await screen.findByText("별빛")).closest("ol")!;
  expect(within(list).getAllByRole("listitem")).toHaveLength(2);
  expect(list.textContent).toContain("별빛");
  expect(list.textContent).toContain("골드");
  expect(list.textContent).not.toMatch(/원|₩|P\b/);
  expect(screen.getByRole("link", { name: /로그인하고 내 순위 보기/ })).toHaveAttribute("href", expect.stringContaining("/login"));
  expect(screen.getByRole("link", { name: /전체 보기/ })).toHaveAttribute("href", "/rankings?locale=ko");
  expect(fetcher).toHaveBeenCalledWith("/api/rankings/fans?period=week&limit=5", expect.anything());
});

it("shows creators by fan count in the second tab, each row opening the fan page", async () => {
  stub(fans());
  render(<HomeRankingCard locale="ko" />);
  await screen.findByText("별빛");
  fireEvent.click(screen.getByRole("tab", { name: "크리에이터 랭킹" }));
  const row = await screen.findByRole("link", { name: /엘리나/ });
  expect(row).toHaveAttribute("href", "/elina?locale=ko");
  expect(row.textContent).toContain("팬 136");
});

it("pins a signed-in viewer's own rank under the list when it is outside the rows", async () => {
  auth.value = { ...auth.value, authenticated: true, user: { id: "me" } };
  stub(fans({ rank: 42, score: 1, inTop: false }));
  render(<HomeRankingCard locale="ko" />);
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("42위"));
  expect(screen.queryByRole("link", { name: /로그인하고/ })).not.toBeInTheDocument();
});

it("keeps the two home copies on one tab, so pressing the hidden copy also switches the visible one", async () => {
  stub(fans());
  render(<><HomeRankingCard locale="ko" headingId="a" /><HomeRankingCard locale="ko" headingId="b" /></>);
  await waitFor(() => expect(screen.getAllByText("별빛")).toHaveLength(2));
  fireEvent.click(screen.getAllByRole("tab", { name: "크리에이터 랭킹" })[0]!);
  await waitFor(() => expect(screen.getAllByRole("link", { name: /엘리나/ })).toHaveLength(2));
  for (const tab of screen.getAllByRole("tab", { name: "크리에이터 랭킹" })) expect(tab).toHaveAttribute("aria-selected", "true");
});
