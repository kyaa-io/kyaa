import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ value: { ready: true, authenticated: false, user: null as null | { id: string }, getAccessToken: async () => "t" } }));
vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => auth.value }));

import { clearResources } from "@/components/fan-ui/resource-cache";
import { HomeRankingCard, resetHomeRankingTab, updatedLabel } from "./home-ranking-card";
import { nextReadDelay } from "./ranking-rows";

const fanRow = (rank: number, extra: Record<string, unknown> = {}) => ({ rank, score: 30 - rank, hearts: 30 - rank, points: null, nickname: `팬${rank}`, characterId: "star-pink", tier: rank === 1 ? "Gold" : null, isMe: false, delta: null, favorite: null, ...extra });
const fans = (rows = [fanRow(1, { nickname: "별빛", delta: 2, favorite: { slug: "elina", name: "엘리나" } }), fanRow(2, { nickname: "나", isMe: true, delta: -1 }), fanRow(3, { delta: 0 }), fanRow(4, { nickname: "새별" })], me: unknown = null, extra: Record<string, unknown> = {}) =>
  ({ state: "ready", metric: "hearts", day: "2026-11-08", computedAt: "2026-11-08T00:00:00Z", fetchedAt: "2026-11-08T00:01:00Z", comparable: true, me, rows, ...extra });
const creatorRow = (rank: number, extra: Record<string, unknown> = {}) => ({ rank, slug: `c${rank}`, name: `크리에이터${rank}`, imageUrl: null, score: 900 - rank, hearts: 900 - rank, fans: 200 - rank, challenge: false, delta: null, weekGain: null, ...extra });
const creators = (extra: Record<string, unknown> = {}) => ({ state: "ready", metric: "hearts", day: "2026-11-08", computedAt: null, comparable: true, weekGainDays: 7,
  rows: [creatorRow(1, { slug: "elina", name: "엘리나", score: 40, hearts: 40, fans: 3, challenge: true, weekGain: 12 }), creatorRow(2, { weekGain: 0 }), creatorRow(3)], ...extra });

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); clearResources(); resetHomeRankingTab(); auth.value = { ...auth.value, authenticated: false, user: null }; });

/** Answers by URL: the fan or creator body, with the asked metric written back as the server does. */
function stub(fanBody: Record<string, unknown> = fans(), creatorBody: Record<string, unknown> = creators()) {
  const fetcher = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    const url = new URL(String(input), "https://x");
    const body = url.searchParams.get("kind") === "creators" ? creatorBody : fanBody;
    return Response.json({ ...body, metric: url.searchParams.get("metric") });
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
const urls = (fetcher: ReturnType<typeof stub>) => fetcher.mock.calls.map(([input]) => String(input));

/** The narrow card (tabs) and the wide cards (two rankings) are both in the page; CSS shows one. */
const narrow = (container: HTMLElement) => container.querySelector<HTMLElement>("[data-home-ranking] > div:first-child")!;
const wide = (container: HTMLElement) => container.querySelector<HTMLElement>("[data-home-ranking] > div:nth-child(2)")!;

it("opens both lists on hearts (the screens name the metric), five rows, movement on every row and 신규 where there is none", async () => {
  const fetcher = stub();
  const { container } = render(<HomeRankingCard locale="ko" />);
  const list = (await within(narrow(container)).findByText("별빛")).closest("ol")!;
  expect(urls(fetcher)).toEqual(expect.arrayContaining(["/api/rankings/home?kind=fans&metric=hearts&locale=ko", "/api/rankings/home?kind=creators&metric=hearts&locale=ko"]));
  // R8-RULE-1: four answers and one placeholder make five rows.
  expect(list.querySelectorAll(":scope > li")).toHaveLength(5);
  expect(list.querySelectorAll("[data-placeholder]")).toHaveLength(1);
  const items = within(list).getAllByRole("listitem");
  expect(items[0]!.textContent).toContain("골드·최애 엘리나");
  expect(within(items[0]!).getByLabelText("하트 29개")).toBeInTheDocument();
  expect(items[2]!.textContent).not.toMatch(/최애|·/);
  expect(items[3]!.textContent).toContain("신규");
  // One column layout for every answered row: each has the 36px movement cell.
  for (const item of items.slice(0, 4)) expect(item.querySelector("[data-delta-cell]")).not.toBeNull();
  expect(within(list).getByRole("img", { name: "2계단 올라감" })).toBeInTheDocument();
  expect(within(list).getByRole("img", { name: "1계단 내려감" })).toBeInTheDocument();
  expect(within(list).getByRole("img", { name: "변동 없음" })).toBeInTheDocument();
  expect(list.textContent).not.toMatch(/원|₩/);
  expect(within(narrow(container)).getByRole("button", { name: "하트" })).toHaveAttribute("aria-pressed", "true");
  expect(within(narrow(container)).getByText(/^업데이트 /)).toBeInTheDocument();
});

it("on the first built day every row reads 신규 and the rows keep the same columns", async () => {
  stub(fans([fanRow(1), fanRow(2), fanRow(3)], null, { comparable: false }));
  const { container } = render(<HomeRankingCard locale="ko" />);
  await within(narrow(container)).findByText("팬1");
  const answered = narrow(container).querySelectorAll("li[data-row='fan-rank']");
  expect(answered).toHaveLength(3);
  for (const row of answered) expect(row.querySelector("[data-direction='new']")).not.toBeNull();
});

it("switches the metric in both copies, reads only that metric, and shows five loading rows meanwhile (no rows of the other metric)", async () => {
  let release!: () => void;
  const fetcher = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input), "https://x");
    if (url.searchParams.get("metric") === "points") {
      await new Promise<void>((resolve) => { release = resolve; });
      return Response.json(fans([fanRow(1, { nickname: "점수왕", score: 500, hearts: 1, points: 500 })], null, { metric: "points" }));
    }
    return Response.json(url.searchParams.get("kind") === "creators" ? creators() : fans());
  });
  vi.stubGlobal("fetch", fetcher);
  const { container } = render(<HomeRankingCard locale="ko" />);
  await within(narrow(container)).findByText("별빛");
  fireEvent.click(within(narrow(container)).getByRole("button", { name: "포인트" }));
  await waitFor(() => expect(narrow(container).querySelectorAll("li[data-row='fan-rank-loading']")).toHaveLength(5));
  expect(within(narrow(container)).queryByText("별빛")).toBeNull();
  expect(within(wide(container)).getAllByRole("button", { name: "포인트" })[0]).toHaveAttribute("aria-pressed", "true");
  expect(urls(fetcher as never)).toContain("/api/rankings/home?kind=fans&metric=points&locale=ko");
  expect(urls(fetcher as never).filter((url) => url.includes("kind=creators"))).toHaveLength(1);
  await act(async () => { release(); });
  const row = (await within(narrow(container)).findByText("점수왕")).closest("li")!;
  // The value is the named points, not the hearts of the same row.
  expect(within(row).getByLabelText("포인트 500")).toBeInTheDocument();
  expect(row.textContent).toContain("500P");
});

it("draws the creator value by name: ♥ hearts on hearts with 찐팬 below, 찐팬 on 찐팬 with ♥ below", async () => {
  stub();
  const { container } = render(<HomeRankingCard locale="ko" />);
  const cards = () => wide(container).querySelectorAll("section");
  const row = await within(cards()[1] as HTMLElement).findByRole("link", { name: /엘리나/ });
  expect(row).toHaveAttribute("href", "/elina?locale=ko");
  expect(row.querySelector("[data-metric='hearts']")).toHaveAttribute("aria-label", "하트 40개");
  expect(row.textContent).toContain("찐팬 3");
  expect(row.textContent).toContain("이번 주 +12");
  // The home card leaves the challenge tag to /rankings.
  expect(row.textContent).not.toContain("찐팬 100 도전 중");
  expect(within(cards()[1] as HTMLElement).getByRole("link", { name: /크리에이터2/ }).textContent).not.toMatch(/이번 주/);
  fireEvent.click(within(cards()[1] as HTMLElement).getByRole("button", { name: "찐팬 수" }));
  const byFans = await waitFor(() => { const link = within(cards()[1] as HTMLElement).getByRole("link", { name: /엘리나/ }); if (!link.querySelector("[data-metric='fans']")) throw new Error("not yet"); return link; });
  expect(byFans.querySelector("[data-metric='fans']")).toHaveAttribute("aria-label", "찐팬 3");
  expect(within(byFans).getByLabelText("하트 40개")).toBeInTheDocument();
});

it("an empty day keeps five rows and the reason, never an older day's rows; the card has the same parts as a full one", async () => {
  stub(fans([], null, { state: "empty" }), creators({ state: "empty", rows: [] }));
  const { container } = render(<HomeRankingCard locale="ko" />);
  expect(await within(narrow(container)).findByText("아직 하트를 보낸 팬이 없어요")).toBeInTheDocument();
  const rows = narrow(container).querySelectorAll("ol > li");
  expect(rows).toHaveLength(5);
  expect(rows[0]).not.toHaveAttribute("aria-hidden");
  for (const row of [...rows].slice(1)) { expect(row).toHaveAttribute("aria-hidden", "true"); expect(row.textContent).toMatch(/\d—/); }
  expect(within(wide(container)).getByText("아직 순위가 없어요")).toBeInTheDocument();
  expect(narrow(container).querySelector("[data-metric-line]")).not.toBeNull();
});

it("a late day (today not built yet) shows its rows with the date instead of the time", async () => {
  const yesterday = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();
  stub(fans(undefined, null, { state: "stale", computedAt: yesterday }));
  const { container } = render(<HomeRankingCard locale="ko" />);
  await within(narrow(container)).findByText("별빛");
  expect(within(narrow(container)).getByText(/^업데이트 \d+\. \d+\.$/)).toBeInTheDocument();
});

it("carries the tab and the chosen metric to the full ranking, through sign-in for a guest", async () => {
  stub();
  const { container, unmount } = render(<HomeRankingCard locale="ko" />);
  await within(narrow(container)).findByText("별빛");
  const guestAll = within(narrow(container)).getByRole("link", { name: "전체 보기" }).getAttribute("href")!;
  expect(guestAll).toContain("/login");
  expect(decodeURIComponent(guestAll)).toContain("/rankings?locale=ko&tab=fans&metric=hearts");
  expect(within(narrow(container)).getByRole("link", { name: /로그인하고 내 순위 보기/ })).toHaveAttribute("href", expect.stringContaining("/login"));
  unmount(); clearResources();
  auth.value = { ...auth.value, authenticated: true, user: { id: "me" } };
  const view = render(<HomeRankingCard locale="ko" />);
  await within(narrow(view.container)).findByText("별빛");
  fireEvent.click(within(narrow(view.container)).getByRole("button", { name: "포인트" }));
  expect(within(narrow(view.container)).getByRole("link", { name: "전체 보기" })).toHaveAttribute("href", "/rankings?locale=ko&tab=fans&metric=points");
  const cards = wide(view.container).querySelectorAll("section");
  expect(within(cards[0] as HTMLElement).getByRole("link", { name: "전체 보기" })).toHaveAttribute("href", "/rankings?locale=ko&tab=fans&metric=points");
  fireEvent.click(within(cards[1] as HTMLElement).getByRole("button", { name: "찐팬 수" }));
  await waitFor(() => expect(within(cards[1] as HTMLElement).getByRole("link", { name: "전체 보기" })).toHaveAttribute("href", "/rankings?locale=ko&tab=creators&metric=fans"));
  fireEvent.click(screen.getByRole("tab", { name: "크리에이터" }));
  await waitFor(() => expect(within(narrow(view.container)).getByRole("link", { name: "전체 보기" })).toHaveAttribute("href", "/rankings?locale=ko&tab=creators&metric=fans"));
});

it("pins a signed-in viewer's own rank in the chosen metric with its movement, or a dash when there is none", async () => {
  auth.value = { ...auth.value, authenticated: true, user: { id: "me" } };
  stub(fans(undefined, { rank: 42, score: 3, hearts: 3, points: null, inTop: false, delta: 1 }));
  const first = render(<HomeRankingCard locale="ko" />);
  await waitFor(() => expect(within(narrow(first.container)).getByRole("status").textContent).toContain("42위"));
  const status = within(narrow(first.container)).getByRole("status");
  expect(within(status).getByLabelText("하트 3개")).toBeInTheDocument();
  expect(within(status).getByRole("img", { name: "1계단 올라감" })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /로그인하고/ })).not.toBeInTheDocument();
  first.unmount(); clearResources(); resetHomeRankingTab();
  stub(fans([fanRow(1)], null));
  const second = render(<HomeRankingCard locale="ko" />);
  await waitFor(() => expect(within(narrow(second.container)).getByRole("status").textContent).toMatch(/내 순위.*—/));
});

it("draws the two rankings as two cards for wide screens, each with its heading, metric line, five rows and bottom line", async () => {
  stub();
  const { container } = render(<HomeRankingCard locale="ko" />);
  await within(wide(container)).findByText("별빛");
  const cards = wide(container).querySelectorAll("section");
  expect(cards).toHaveLength(2);
  expect(within(cards[0] as HTMLElement).getByRole("heading", { name: "팬 랭킹" })).toBeInTheDocument();
  expect(within(cards[1] as HTMLElement).getByRole("heading", { name: "크리에이터 랭킹" })).toBeInTheDocument();
  for (const card of cards) {
    expect(card.querySelectorAll("ol > li")).toHaveLength(5);
    expect(card.querySelector("[data-metric-line]")).not.toBeNull();
    expect((card.querySelector("ol")!.nextElementSibling as HTMLElement).textContent).not.toBe("");
  }
});

it("uses the same words in English", async () => {
  stub();
  const { container } = render(<HomeRankingCard locale="en" />);
  await within(narrow(container)).findByText("별빛");
  expect(screen.getByRole("tab", { name: "Fans" })).toBeInTheDocument();
  expect(within(narrow(container)).getByRole("button", { name: "Points" })).toBeInTheDocument();
  expect(within(narrow(container)).getByRole("img", { name: "Up 2" })).toBeInTheDocument();
  expect(within(wide(container)).getByRole("heading", { name: "Fan rankings" })).toBeInTheDocument();
});

it("reads again when the shown snapshot turns ten minutes old (server clock), not ten minutes after the answer came", () => {
  const zero = () => 0;
  expect(nextReadDelay("2026-11-08T00:09:59Z", "2026-11-08T00:00:00Z", zero)).toBe(60_000);
  expect(nextReadDelay("2026-11-08T00:00:00Z", "2026-11-08T00:00:00Z", zero)).toBe(600_000);
  expect(nextReadDelay("2026-11-08T00:05:00Z", "2026-11-08T00:00:00Z", zero)).toBe(300_000);
  // A late or failing snapshot stays old: never more often than once a minute.
  expect(nextReadDelay("2026-11-09T00:00:00Z", "2026-11-08T00:00:00Z", zero)).toBe(60_000);
  expect(nextReadDelay(undefined, null, zero)).toBe(60_000);
  expect(nextReadDelay("2026-11-08T00:00:00Z", "2026-11-08T00:00:00Z", () => 0.999)).toBeLessThan(630_000);
});

it("re-reads by a timer while visible, skips the browser copy, and waits while hidden until it is visible again", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  let hidden = false;
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => (hidden ? "hidden" : "visible"));
  const fetcher = stub(fans(undefined, null, { computedAt: "2026-11-08T00:00:00Z", fetchedAt: "2026-11-08T00:09:59Z" }));
  const { container } = render(<HomeRankingCard locale="ko" />);
  await within(narrow(container)).findByText("별빛");
  const fanReads = () => fetcher.mock.calls.filter(([input]) => String(input).includes("kind=fans"));
  expect(fanReads()).toHaveLength(1);
  await act(async () => { vi.advanceTimersByTime(59_000); });
  expect(fanReads()).toHaveLength(1);
  await act(async () => { vi.advanceTimersByTime(32_000); });
  await waitFor(() => expect(fanReads()).toHaveLength(2));
  expect(fanReads()[1]![1]).toMatchObject({ cache: "no-cache" });
  // The rows stayed on screen.
  expect(within(narrow(container)).getByText("별빛")).toBeInTheDocument();
  hidden = true;
  document.dispatchEvent(new Event("visibilitychange"));
  await act(async () => { vi.advanceTimersByTime(5 * 60_000); });
  expect(fanReads()).toHaveLength(2);
  hidden = false;
  document.dispatchEvent(new Event("visibilitychange"));
  await waitFor(() => expect(fanReads()).toHaveLength(3));
});

it("moves only the rows whose rank changed on a re-read of the same metric, and not under reduced motion", async () => {
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
      answer = fans([fanRow(1, { nickname: "나나", score: 40, hearts: 40, delta: 1 }), fanRow(2, { nickname: "가", delta: -1 }), fanRow(3, { nickname: "다", delta: 0 })]);
      now += 11 * 60 * 1000;
      document.dispatchEvent(new Event("visibilitychange"));
      await waitFor(() => expect(view.container.querySelector("ol > li")!.textContent).toContain("나나"));
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

it("says when the day was written: the time today, the date otherwise", () => {
  const now = new Date(2026, 10, 8, 15, 0);
  expect(updatedLabel("ko", new Date(2026, 10, 8, 9, 40).toISOString(), now)).toBe("업데이트 09:40");
  expect(updatedLabel("ko", new Date(2026, 10, 7, 23, 50).toISOString(), now)).toBe("업데이트 11. 7.");
  expect(updatedLabel("en", new Date(2026, 10, 8, 9, 40).toISOString(), now)).toBe("Updated 09:40");
  expect(updatedLabel("ko", "not a time", now)).toBeNull();
});

it("R6-EXTRACT ⑦: a fan row keeps ♥N on the right and adds +N only when this week's gain is above 0", async () => {
  stub(fans([fanRow(1, { nickname: "주간팬", score: 911, hearts: 911, delta: 0, weekGain: 35 }), fanRow(2, { nickname: "조용한팬", score: 900, hearts: 900, weekGain: 0 })]));
  const { container } = render(<HomeRankingCard locale="ko" />);
  await within(narrow(container)).findByText("주간팬");
  const gains = narrow(container).querySelectorAll("[data-week-gain]");
  expect(gains).toHaveLength(1);
  expect(gains[0]!.textContent).toBe("+35");
  expect(within(narrow(container)).getByLabelText("하트 911개")).toBeInTheDocument();
});
