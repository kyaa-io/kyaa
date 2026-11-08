import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ value: { ready: true, authenticated: false, user: null as null | { id: string }, getAccessToken: async () => "t" } }));
vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => auth.value }));

import { clearResources } from "@/components/fan-ui/resource-cache";
import { HomeRankingCard, resetHomeRankingTab, updatedLabel } from "./home-ranking-card";

const fanRow = (rank: number, extra: Record<string, unknown> = {}) => ({ rank, score: 30 - rank, nickname: `팬${rank}`, characterId: "star-pink", tier: rank === 1 ? "Gold" : null, isMe: false, delta: null, favorite: null, ...extra });
const fans = (rows = [fanRow(1, { nickname: "별빛", delta: 2, favorite: { slug: "elina", name: "엘리나" } }), fanRow(2, { nickname: "나", isMe: true, delta: -1 }), fanRow(3, { delta: 0 }), fanRow(4, { nickname: "새별" })], me: unknown = null) =>
  ({ day: "2026-11-08", computedAt: "2026-11-08T00:00:00Z", comparable: true, me, rows });
const creatorRow = (rank: number, extra: Record<string, unknown> = {}) => ({ rank, slug: `c${rank}`, name: `크리에이터${rank}`, imageUrl: null, score: 200 - rank, hearts: 900 - rank, challenge: false, delta: null, weekGain: null, ...extra });
const creators = { day: "2026-11-08", computedAt: null, comparable: false, weekGainDays: 7, rows: [creatorRow(1, { slug: "elina", name: "엘리나", score: 125, hearts: 795, challenge: true, weekGain: 12 }), creatorRow(2, { weekGain: 0 }), creatorRow(3)] };

afterEach(() => { vi.unstubAllGlobals(); clearResources(); resetHomeRankingTab(); auth.value = { ...auth.value, authenticated: false, user: null }; });

function stub(fanBody: unknown, creatorBody: unknown = creators) {
  const fetcher = vi.fn(async (input: string | URL | Request) => Response.json(String(input).includes("kind=creators") ? creatorBody : fanBody));
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

it("R18: five 56px rows of rank · name · hearts · movement, the movement always drawn, a basis line and 전체 보기", async () => {
  const fetcher = stub(fans(Array.from({ length: 8 }, (_, i) => fanRow(i + 1, { delta: [2, -1, 0, null, 1, 0, 0, 0][i] }))));
  const { container } = render(<HomeRankingCard locale="ko" />);
  const list = (await screen.findByText("팬1")).closest("ol")!;
  const rows = within(list).getAllByRole("listitem");
  expect(rows).toHaveLength(5);
  for (const row of rows) { expect(row).toHaveAttribute("data-row", "rank"); expect(row.querySelectorAll("[data-delta]")).toHaveLength(1); }
  expect(rows.map((row) => row.querySelector("[data-delta]")!.getAttribute("data-delta"))).toEqual(["up", "down", "same", "new", "up"]);
  expect(within(rows[0]!).getByRole("img", { name: "2계단 올라감" })).toBeInTheDocument();
  expect(within(rows[0]!).getByLabelText("하트 29개")).toBeInTheDocument();
  expect(rows[0]!.querySelector('svg[data-icon="heart"]')).toHaveAttribute("fill", "currentColor");
  const basis = container.querySelector("[data-ranking-basis]")!;
  await waitFor(() => expect(basis.textContent).toMatch(/^누적 하트 · 업데이트 (\d\d\. \d\d\. )?\d\d:\d\d$/));
  expect(basis.querySelector("[data-updated-at]")).not.toBeNull();
  expect(basis.tagName).not.toBe("P");
  expect(screen.getByRole("link", { name: /전체 보기/ })).toHaveAttribute("href", "/rankings?locale=ko&tab=fans");
  expect(screen.queryByRole("button", { name: "11~20위" })).toBeNull();
  expect(container.querySelector('[data-block="ranking"]')).not.toBeNull();
  expect(fetcher).toHaveBeenCalledWith("/api/rankings/home?kind=fans&locale=ko", expect.anything());
});

it("before seven days are kept the movement shows this week's gain (+N), and — when there is nothing to compare", async () => {
  stub(fans());
  render(<HomeRankingCard locale="ko" />);
  await screen.findByText("별빛");
  fireEvent.click(screen.getByRole("tab", { name: "크리에이터 순위" }));
  const row = await screen.findByRole("link", { name: /엘리나/ });
  expect(row).toHaveAttribute("href", "/elina?locale=ko");
  expect(within(row).getByLabelText("찐팬 125")).toBeInTheDocument();
  expect(row.querySelector("[data-delta]")).toHaveAttribute("data-delta", "gain");
  expect(row.querySelector("[data-delta]")!.textContent).toBe("+12");
  expect(screen.getByRole("link", { name: /크리에이터2/ }).querySelector("[data-delta]")).toHaveAttribute("data-delta", "same");
  expect(screen.getByText("찐팬 수")).toBeInTheDocument();
});

it("uses the server's close and read time (period day: no week claimed) and the fans' weekly gain", async () => {
  stub({ ...fans([fanRow(1, { weekGain: 40 }), fanRow(2)]), comparable: false, period: "day", closesAt: new Date(2026, 10, 10, 0, 0).toISOString(), fetchedAt: new Date().toISOString() });
  const { container } = render(<HomeRankingCard locale="ko" />);
  await screen.findByText("팬1");
  await waitFor(() => expect(container.querySelector("[data-ranking-basis]")!.textContent).toMatch(/^누적 하트 · 11\. 10\. 00:00 마감 · 업데이트 \d\d:\d\d$/));
  expect(container.textContent).not.toMatch(/이번 주 ·|day/);
  const deltas = [...container.querySelectorAll("[data-delta]")].map((node) => node.textContent);
  expect(deltas[0]).toBe("+40");
});

it("keeps the empty state at the five-row place", async () => {
  stub(fans([]));
  const { container } = render(<HomeRankingCard locale="ko" />);
  expect(await screen.findByText("아직 하트를 보낸 팬이 없어요")).toBeInTheDocument();
  expect(container.querySelector("ol")).toBeNull();
});

it("uses the same words in English", async () => {
  stub(fans());
  render(<HomeRankingCard locale="en" />);
  await screen.findByText("별빛");
  expect(screen.getByRole("tab", { name: "True fan ranking" })).toBeInTheDocument();
  expect(screen.getByRole("img", { name: "Up 2" })).toBeInTheDocument();
});

it("moves only the rows whose rank changed when the tab comes back after 60 seconds (R21), and not under reduced motion", async () => {
  const animate = vi.fn((_keyframes: unknown, _options?: unknown) => ({}) as Animation);
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetTop");
  Object.defineProperty(HTMLElement.prototype, "offsetTop", { configurable: true, get(this: HTMLElement) { return this.parentElement ? Array.from(this.parentElement.children).indexOf(this) * 56 : 0; } });
  Element.prototype.animate = animate as unknown as Element["animate"];
  const at = vi.spyOn(Date, "now");
  let now = Date.parse("2026-11-08T03:00:00Z");
  at.mockImplementation(() => now);
  try {
    for (const reduced of [false, true]) {
      animate.mockClear(); clearResources(); resetHomeRankingTab();
      vi.stubGlobal("matchMedia", (query: string) => ({ matches: reduced && query.includes("reduce"), addEventListener() {}, removeEventListener() {} }));
      let answer = fans([fanRow(1, { nickname: "가" }), fanRow(2, { nickname: "나나" }), fanRow(3, { nickname: "다" })]);
      vi.stubGlobal("fetch", vi.fn(async () => Response.json(answer)));
      const view = render(<HomeRankingCard locale="ko" />);
      await screen.findByText("가");
      expect(animate).not.toHaveBeenCalled();
      answer = fans([fanRow(1, { nickname: "나나", score: 40, delta: 1 }), fanRow(2, { nickname: "가", delta: -1 }), fanRow(3, { nickname: "다", delta: 0 })]);
      now += 61 * 1000;
      document.dispatchEvent(new Event("visibilitychange"));
      await waitFor(() => expect(view.container.querySelector("ol > li")!.textContent).toContain("나나"));
      // The rows stayed on screen while reading again.
      const moves = animate.mock.calls.filter((call) => JSON.stringify(call[0]).includes("translateY"));
      expect(moves).toHaveLength(reduced ? 0 : 2);
      view.unmount();
    }
  } finally {
    at.mockRestore();
    if (original) Object.defineProperty(HTMLElement.prototype, "offsetTop", original);
    delete (Element.prototype as Partial<Element>).animate;
  }
});

it("says when the list was read: the time today, the feed date otherwise", () => {
  const now = new Date(2026, 10, 8, 15, 0);
  expect(updatedLabel("ko", new Date(2026, 10, 8, 9, 40).toISOString(), now)).toBe("업데이트 09:40");
  expect(updatedLabel("ko", new Date(2026, 10, 7, 23, 50).toISOString(), now)).toBe("업데이트 11. 07. 23:50");
  expect(updatedLabel("en", new Date(2026, 10, 8, 9, 40).toISOString(), now)).toBe("Updated 09:40");
  expect(updatedLabel("ko", "not a time", now)).toBeNull();
});
