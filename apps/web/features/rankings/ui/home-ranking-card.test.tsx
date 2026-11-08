import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ value: { ready: true, authenticated: false, user: null as null | { id: string }, getAccessToken: async () => "t" } }));
vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => auth.value }));

import { clearResources } from "@/components/fan-ui/resource-cache";
import { HomeRankingCard, resetHomeRankingTab } from "./home-ranking-card";

const fanRow = (rank: number, extra: Record<string, unknown> = {}) => ({ rank, score: 30 - rank, nickname: `팬${rank}`, characterId: "star-pink", tier: rank === 1 ? "Gold" : null, isMe: false, delta: null, ...extra });
const fans = (rows = [fanRow(1, { nickname: "별빛", delta: 2 }), fanRow(2, { nickname: "나", isMe: true, delta: -1 }), fanRow(3, { delta: 0 })], me: unknown = null) =>
  ({ day: "2026-11-08", computedAt: "2026-11-08T00:00:00Z", comparable: true, me, rows });
const creators = { day: "2026-11-08", computedAt: null, comparable: false, rows: [{ rank: 1, slug: "elina", name: "엘리나", imageUrl: null, score: 125, hearts: 795, challenge: true, delta: null }] };

afterEach(() => { vi.unstubAllGlobals(); clearResources(); resetHomeRankingTab(); auth.value = { ...auth.value, authenticated: false, user: null }; });

function stub(fanBody: unknown, creatorBody: unknown = creators) {
  const fetcher = vi.fn(async (input: string | URL | Request) => Response.json(String(input).includes("kind=creators") ? creatorBody : fanBody));
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

it("lists true fans by all-time hearts with the move since yesterday, and asks a guest to sign in for their own rank", async () => {
  const fetcher = stub(fans());
  render(<HomeRankingCard locale="ko" />);
  const list = (await screen.findByText("별빛")).closest("ol")!;
  expect(within(list).getAllByRole("listitem")).toHaveLength(3);
  expect(list.textContent).toContain("골드");
  expect(list.textContent).not.toMatch(/원|₩|P\b/);
  expect(within(list).getByRole("img", { name: "2계단 올라감" })).toBeInTheDocument();
  expect(within(list).getByRole("img", { name: "1계단 내려감" })).toBeInTheDocument();
  expect(within(list).getByRole("img", { name: "변동 없음" })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "찐팬 순위" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByText("누적 하트")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /로그인하고 내 순위 보기/ })).toHaveAttribute("href", expect.stringContaining("/login"));
  expect(fetcher).toHaveBeenCalledWith("/api/rankings/home?kind=fans", expect.anything());
});

it("shows ten rows and opens 11 to 20 inside the card", async () => {
  stub(fans(Array.from({ length: 20 }, (_, i) => fanRow(i + 1))));
  const { container } = render(<HomeRankingCard locale="ko" />);
  await screen.findByText("팬1");
  expect(container.querySelectorAll("ol > li")).toHaveLength(10);
  const more = screen.getByRole("button", { name: "11~20위" });
  expect(more).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(more);
  expect(container.querySelectorAll("ol > li")).toHaveLength(20);
  expect(more).toHaveAttribute("aria-expanded", "true");
});

it("keeps the empty state at the ten-row height without the bottom line", async () => {
  stub(fans([]));
  const { container } = render(<HomeRankingCard locale="ko" />);
  expect(await screen.findByText("아직 하트를 보낸 팬이 없어요")).toBeInTheDocument();
  expect(container.querySelector("ol")).toBeNull();
  expect(screen.queryByRole("button", { name: "11~20위" })).not.toBeInTheDocument();
});

it("shows creators by true fans with the heart total, each row opening the fan page", async () => {
  stub(fans());
  render(<HomeRankingCard locale="ko" />);
  await screen.findByText("별빛");
  fireEvent.click(screen.getByRole("tab", { name: "크리에이터 순위" }));
  const row = await screen.findByRole("link", { name: /엘리나/ });
  expect(row).toHaveAttribute("href", "/elina?locale=ko");
  expect(row.textContent).toContain("찐팬 125");
  expect(within(row).getByLabelText("하트 795개")).toBeInTheDocument();
  expect(within(row).getByRole("img", { name: "변동 없음" })).toBeInTheDocument();
  expect(screen.getByText("찐팬 수")).toBeInTheDocument();
});

it("pins a signed-in viewer's own rank on the bottom line when it is below the shown rows", async () => {
  auth.value = { ...auth.value, authenticated: true, user: { id: "me" } };
  stub(fans(undefined, { rank: 42, score: 1, inTop: false }));
  render(<HomeRankingCard locale="ko" />);
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("42위"));
  expect(screen.queryByRole("link", { name: /로그인하고/ })).not.toBeInTheDocument();
});

it("keeps the two home copies on one tab, so pressing the hidden copy also switches the visible one", async () => {
  stub(fans());
  render(<><HomeRankingCard locale="ko" headingId="a" /><HomeRankingCard locale="ko" headingId="b" /></>);
  await waitFor(() => expect(screen.getAllByText("별빛")).toHaveLength(2));
  fireEvent.click(screen.getAllByRole("tab", { name: "크리에이터 순위" })[0]!);
  await waitFor(() => expect(screen.getAllByRole("link", { name: /엘리나/ })).toHaveLength(2));
  for (const tab of screen.getAllByRole("tab", { name: "크리에이터 순위" })) expect(tab).toHaveAttribute("aria-selected", "true");
});

it("uses the same words in English", async () => {
  stub(fans());
  render(<HomeRankingCard locale="en" />);
  await screen.findByText("별빛");
  expect(screen.getByRole("tab", { name: "True fan ranking" })).toBeInTheDocument();
  expect(screen.getByRole("img", { name: "Up 2" })).toBeInTheDocument();
});
