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

it("lists true fans by all-time hearts with the move since yesterday, and asks a guest to sign in for their own rank", async () => {
  const fetcher = stub(fans());
  render(<HomeRankingCard locale="ko" />);
  const list = (await screen.findByText("별빛")).closest("ol")!;
  expect(within(list).getAllByRole("listitem")).toHaveLength(4);
  expect(list.textContent).toContain("골드");
  // Second line: grade and favorite; a row without a favorite has neither the item nor a dot.
  const first = within(list).getAllByRole("listitem")[0]!;
  expect(first.textContent).toContain("골드·최애 엘리나");
  expect(within(first).getByLabelText("하트 29개")).toBeInTheDocument();
  expect(within(list).getAllByRole("listitem")[2]!.textContent).not.toMatch(/최애|·/);
  // A row not ranked yesterday reads 신규 once movement is shown.
  expect(within(list).getAllByRole("listitem")[3]!.textContent).toContain("신규");
  expect(await screen.findAllByText(/^업데이트 \d\d:\d\d$/)).toHaveLength(1);
  expect(list.textContent).not.toMatch(/원|₩|P\b/);
  expect(within(list).getByRole("img", { name: "2계단 올라감" })).toBeInTheDocument();
  expect(within(list).getByRole("img", { name: "1계단 내려감" })).toBeInTheDocument();
  expect(within(list).getByRole("img", { name: "변동 없음" })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "찐팬 순위" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByText("누적 하트")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /로그인하고 내 순위 보기/ })).toHaveAttribute("href", expect.stringContaining("/login"));
  expect(fetcher).toHaveBeenCalledWith("/api/rankings/home?kind=fans&locale=ko", expect.anything());
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
  expect(within(row).getByLabelText("찐팬 125")).toBeInTheDocument();
  expect(within(row).getByLabelText("하트 795개")).toBeInTheDocument();
  expect(row.textContent).toContain("이번 주 +12");
  expect(screen.getByRole("link", { name: /크리에이터2/ }).textContent).toContain("이번 주 0");
  // weekGain null: no item and no dot after the hearts.
  expect(screen.getByRole("link", { name: /크리에이터3/ }).textContent).not.toMatch(/이번 주|·/);
  expect(document.body.textContent).not.toMatch(/팬 \d/);
  // Seven days not kept yet: no movement column at all, four columns.
  expect(row.querySelector("[data-direction]")).toBeNull();
  expect(row).not.toHaveAttribute("data-comparable");
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

it("moves only the rows whose rank changed when the tab comes back after ten minutes, and not under reduced motion", async () => {
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
      now += 11 * 60 * 1000;
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

it("draws no movement column before seven days are kept", async () => {
  stub({ ...fans(), comparable: false });
  const { container } = render(<HomeRankingCard locale="ko" />);
  await screen.findByText("별빛");
  expect(container.querySelectorAll("[data-direction]")).toHaveLength(0);
  expect(container.querySelectorAll("li[data-comparable]")).toHaveLength(0);
});

it("says when the day was written: the time today, the date otherwise", () => {
  const now = new Date(2026, 10, 8, 15, 0);
  expect(updatedLabel("ko", new Date(2026, 10, 8, 9, 40).toISOString(), now)).toBe("업데이트 09:40");
  expect(updatedLabel("ko", new Date(2026, 10, 7, 23, 50).toISOString(), now)).toBe("업데이트 11. 7.");
  expect(updatedLabel("en", new Date(2026, 10, 8, 9, 40).toISOString(), now)).toBe("Updated 09:40");
  expect(updatedLabel("ko", "not a time", now)).toBeNull();
});
