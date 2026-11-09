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

/** The narrow card (tabs) and the wide cards (two rankings) are both in the page; CSS shows one. */
const narrow = (container: HTMLElement) => container.querySelector<HTMLElement>("[data-home-ranking] > div:first-child")!;
const wide = (container: HTMLElement) => container.querySelector<HTMLElement>("[data-home-ranking] > div:nth-child(2)")!;

it("lists true fans by all-time hearts with the move since yesterday, and asks a guest to sign in for their own rank", async () => {
  const fetcher = stub(fans());
  const { container } = render(<HomeRankingCard locale="ko" />);
  const list = (await within(narrow(container)).findByText("별빛")).closest("ol")!;
  // R8-RULE-1: four answers and one placeholder make five rows.
  expect(list.querySelectorAll(":scope > li")).toHaveLength(5);
  expect(list.querySelectorAll("[data-placeholder]")).toHaveLength(1);
  expect(list.textContent).toContain("골드");
  // Second line: grade and favorite; a row without a favorite has neither the item nor a dot.
  const first = within(list).getAllByRole("listitem")[0]!;
  expect(first.textContent).toContain("골드·최애 엘리나");
  expect(within(first).getByLabelText("하트 29개")).toBeInTheDocument();
  expect(within(list).getAllByRole("listitem")[2]!.textContent).not.toMatch(/최애|·/);
  // A row not ranked yesterday reads 신규 once movement is shown.
  expect(within(list).getAllByRole("listitem")[3]!.textContent).toContain("신규");
  expect(await within(narrow(container)).findAllByText(/^업데이트 (\d\d:\d\d|\d+\. \d+\.)$/)).toHaveLength(1);
  expect(list.textContent).not.toMatch(/원|₩|P\b/);
  expect(within(list).getByRole("img", { name: "2계단 올라감" })).toBeInTheDocument();
  expect(within(list).getByRole("img", { name: "1계단 내려감" })).toBeInTheDocument();
  expect(within(list).getByRole("img", { name: "변동 없음" })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "팬" })).toHaveAttribute("aria-selected", "true");
  expect(within(narrow(container)).getByText("누적 하트")).toBeInTheDocument();
  expect(within(narrow(container)).getByRole("link", { name: /로그인하고 내 순위 보기/ })).toHaveAttribute("href", expect.stringContaining("/login"));
  expect(fetcher).toHaveBeenCalledWith("/api/rankings/home?kind=fans&locale=ko", expect.anything());
});

it("shows five rows whatever the answer holds, and no way to open more inside the card", async () => {
  stub(fans(Array.from({ length: 20 }, (_, i) => fanRow(i + 1))));
  const { container } = render(<HomeRankingCard locale="ko" />);
  await within(narrow(container)).findByText("팬1");
  expect(narrow(container).querySelectorAll("ol > li")).toHaveLength(5);
  expect(wide(container).querySelectorAll("section:first-child ol > li")).toHaveLength(5);
  expect(screen.queryByRole("button", { name: "11~20위" })).not.toBeInTheDocument();
});

it("R8-RULE-1: an empty answer keeps five rows, the first one says why, and the card is as high as with a full answer", async () => {
  stub(fans([]), { ...creators, rows: [] });
  const { container } = render(<HomeRankingCard locale="ko" />);
  expect(await within(narrow(container)).findByText("아직 하트를 보낸 팬이 없어요")).toBeInTheDocument();
  const rows = narrow(container).querySelectorAll("ol > li");
  expect(rows).toHaveLength(5);
  expect(rows[0]).not.toHaveAttribute("aria-hidden");
  for (const row of [...rows].slice(1)) { expect(row).toHaveAttribute("aria-hidden", "true"); expect(row.textContent).toMatch(/\d—/); }
  expect(narrow(container).querySelector("[data-empty]")).toBeNull();
  expect(within(wide(container)).getByText("아직 순위가 없어요")).toBeInTheDocument();
});

it("shows creators by true fans with the heart total, each row opening the fan page", async () => {
  stub(fans());
  const { container } = render(<HomeRankingCard locale="ko" />);
  await within(narrow(container)).findByText("별빛");
  fireEvent.click(screen.getByRole("tab", { name: "크리에이터" }));
  const row = await within(narrow(container)).findByRole("link", { name: /엘리나/ });
  expect(row).toHaveAttribute("href", "/elina?locale=ko");
  expect(within(row).getByLabelText("찐팬 125")).toBeInTheDocument();
  expect(within(row).getByLabelText("하트 795개")).toBeInTheDocument();
  expect(row.textContent).toContain("이번 주 +12");
  // weekGain 0: no lone 0.
  expect(within(narrow(container)).getByRole("link", { name: /크리에이터2/ }).textContent).not.toMatch(/이번 주|·/);
  // weekGain null: no item and no dot after the hearts.
  expect(within(narrow(container)).getByRole("link", { name: /크리에이터3/ }).textContent).not.toMatch(/이번 주|·/);
  expect(container.textContent).not.toMatch(/팬 \d/);
  // Seven days not kept yet: no movement column at all, four columns.
  expect(row.querySelector("[data-direction]")).toBeNull();
  expect(row).not.toHaveAttribute("data-comparable");
  expect(within(narrow(container)).getByText("찐팬 수")).toBeInTheDocument();
});

it("pins a signed-in viewer's own rank on the bottom line, or a dash when there is none", async () => {
  auth.value = { ...auth.value, authenticated: true, user: { id: "me" } };
  stub(fans(undefined, { rank: 42, score: 1, inTop: false }));
  const first = render(<HomeRankingCard locale="ko" />);
  await waitFor(() => expect(within(narrow(first.container)).getByRole("status").textContent).toContain("42위"));
  expect(screen.queryByRole("link", { name: /로그인하고/ })).not.toBeInTheDocument();
  first.unmount(); clearResources();
  stub(fans([fanRow(1)], null));
  const second = render(<HomeRankingCard locale="ko" />);
  await waitFor(() => expect(within(narrow(second.container)).getByRole("status").textContent).toMatch(/내 순위.*—/));
});

it("draws the two rankings as two cards for wide screens, each with its own heading, five rows and bottom line height", async () => {
  stub(fans());
  const { container } = render(<HomeRankingCard locale="ko" />);
  await within(wide(container)).findByText("별빛");
  const cards = wide(container).querySelectorAll("section");
  expect(cards).toHaveLength(2);
  expect(within(cards[0] as HTMLElement).getByRole("heading", { name: "팬 랭킹" })).toBeInTheDocument();
  expect(within(cards[1] as HTMLElement).getByRole("heading", { name: "크리에이터 랭킹" })).toBeInTheDocument();
  for (const card of cards) expect(card.querySelectorAll("ol > li")).toHaveLength(5);
  expect(within(cards[1] as HTMLElement).getByRole("link", { name: /엘리나/ })).toHaveAttribute("href", "/elina?locale=ko");
});

it("uses the same words in English", async () => {
  stub(fans());
  const { container } = render(<HomeRankingCard locale="en" />);
  await within(narrow(container)).findByText("별빛");
  expect(screen.getByRole("tab", { name: "Fans" })).toBeInTheDocument();
  expect(within(narrow(container)).getByRole("img", { name: "Up 2" })).toBeInTheDocument();
  expect(within(wide(container)).getByRole("heading", { name: "Fan rankings" })).toBeInTheDocument();
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
      await within(narrow(view.container)).findByText("가");
      expect(animate).not.toHaveBeenCalled();
      answer = fans([fanRow(1, { nickname: "나나", score: 40, delta: 1 }), fanRow(2, { nickname: "가", delta: -1 }), fanRow(3, { nickname: "다", delta: 0 })]);
      now += 11 * 60 * 1000;
      document.dispatchEvent(new Event("visibilitychange"));
      await waitFor(() => expect(view.container.querySelector("ol > li")!.textContent).toContain("나나"));
      // The rows stayed on screen while reading again.
      const moves = animate.mock.calls.filter((call) => JSON.stringify(call[0]).includes("translateY"));
      // Two rows moved in each of the two copies (narrow and wide).
      expect(moves).toHaveLength(reduced ? 0 : 4);
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
  await within(narrow(container)).findByText("별빛");
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

it("R6-EXTRACT ⑦: a fan row keeps the 4차 all-time ♥N on the right and adds +N only when this week's gain is above 0", async () => {
  resetHomeRankingTab();
  const row = { rank: 1, score: 911, nickname: "주간팬", characterId: "fairy-cream", tier: null, isMe: false, delta: 0, favorite: null, weekGain: 35 };
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ day: "2026-11-09", computedAt: null, comparable: true, me: null, rows: [row] }), { status: 200 })));
  const { container } = render(<HomeRankingCard locale="ko" />);
  const gain = await waitFor(() => { const el = container.querySelector("[data-week-gain]"); if (!el) throw new Error("no gain"); return el; });
  expect(gain.textContent).toBe("+35");
  expect(screen.getAllByLabelText("하트 911개").length).toBeGreaterThan(0);
  expect(container.textContent).not.toMatch(/이번 주 ·/);
});

it("R6-EXTRACT ⑦: a fan row with no gain this week shows only the all-time ♥N, never a lone 0", async () => {
  resetHomeRankingTab();
  const row = { rank: 1, score: 911, nickname: "조용한팬", characterId: "fairy-cream", tier: null, isMe: false, delta: 0, favorite: null, weekGain: 0 };
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ day: "2026-11-09", computedAt: null, comparable: false, me: null, rows: [row] }), { status: 200 })));
  const { container } = render(<HomeRankingCard locale="ko" />);
  expect((await screen.findAllByLabelText("하트 911개")).length).toBeGreaterThan(0);
  expect(container.querySelector("[data-week-gain]")).toBeNull();
  expect(container.querySelector('[data-kind="fans"]')!.textContent).not.toMatch(/(^|[^\d])0$/);
});

it("puts the period and the written time on their own line under the title, so no language cuts them; the creators card ends on the same kind of bottom row as the fans card", async () => {
  stub(fans());
  const { container } = render(<HomeRankingCard locale="ja" />);
  await within(narrow(container)).findByText("별빛");
  const head = narrow(container).querySelector("h2")!.closest("div")!;
  expect(head.nextElementSibling).toHaveTextContent(/.+/);
  expect(head.nextElementSibling!.querySelector("time")).not.toBeNull();
  const cards = wide(container).querySelectorAll("section");
  const bottom = (card: Element) => card.querySelector("ol")!.nextElementSibling as HTMLElement;
  expect(bottom(cards[0]!).textContent).not.toBe("");
  expect(bottom(cards[1]!).querySelector("a")).toHaveAttribute("href", "/rankings?locale=ja&tab=creators");
  expect(cards[1]!.querySelector("a[href*='tab=creators']")).toBe(bottom(cards[1]!).querySelector("a"));
});
