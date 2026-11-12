import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ value: { ready: true, authenticated: false, user: null as null | { id: string }, getAccessToken: async () => "t" } }));
vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => auth.value }));

vi.mock("@/features/group-social/profile-modal", () => ({ ProfileModal: ({ person, onClose }: { person: { ref: unknown }; onClose: () => void }) => <div data-testid="ranking-profile">{JSON.stringify(person.ref)}<button onClick={onClose}>close profile</button></div> }));

import { clearResources } from "@/components/fan-ui/resource-cache";
import { HomeRankingCard } from "./home-ranking-card";
import { APP_LOCALES } from "@/i18n/locales";
import { messages } from "@/i18n/catalogs/features__rankings__ui__rankings-copy";
import { rankingsText } from "./rankings-copy";
import { nextReadDelay } from "./ranking-rows";

const fanRow = (rank: number, extra: Record<string, unknown> = {}) => ({ rank, score: 30 - rank, hearts: 30 - rank, points: null, nickname: `팬${rank}`, characterId: "star-pink", fans: 2, liveNow: false, isNew: false, tier: rank === 1 ? "Gold" : null, isMe: false, delta: null, favorite: null, ...extra });
const fans = (rows = [fanRow(1, { nickname: "별빛", delta: 2, favorite: { slug: "elina", name: "엘리나" } }), fanRow(2, { nickname: "나", isMe: true, delta: -1 }), fanRow(3, { delta: 0 }), fanRow(4, { nickname: "새별", isNew: true })], me: unknown = null, extra: Record<string, unknown> = {}) =>
  ({ state: "ready", metric: "hearts", day: "2026-11-08", computedAt: "2026-11-08T00:00:00Z", fetchedAt: "2026-11-08T00:01:00Z", comparable: true, weekGainDays: 7, me, rows, ...extra });
const creatorRow = (rank: number, extra: Record<string, unknown> = {}) => ({ rank, slug: `c${rank}`, name: `크리에이터${rank}`, imageUrl: null, score: 900 - rank, hearts: 900 - rank, fans: 200 - rank, challenge: false, delta: null, weekGain: null, ...extra });
const creators = (extra: Record<string, unknown> = {}) => ({ state: "ready", metric: "hearts", day: "2026-11-08", computedAt: null, comparable: true, weekGainDays: 7,
  rows: [creatorRow(1, { slug: "elina", name: "엘리나", score: 40, hearts: 40, fans: 3, challenge: true, weekGain: 12 }), creatorRow(2, { weekGain: 0 }), creatorRow(3)], ...extra });

afterEach(() => { window.localStorage.clear(); vi.unstubAllGlobals(); vi.useRealTimers(); clearResources(); auth.value = { ...auth.value, authenticated: false, user: null }; });

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

it("is the shared ranking board under one heading: ten heart rows per group, no full-list link", async () => {
  auth.value = { ...auth.value, authenticated: true, user: { id: "viewer" } };
  const fetcher = stub(fans(Array.from({ length: 10 }, (_, i) => fanRow(i + 1))), creators({ rows: Array.from({ length: 10 }, (_, i) => creatorRow(i + 1)) }));
  const { container } = render(<HomeRankingCard locale="ko" />);
  await screen.findByText("팬10");
  expect(container.querySelectorAll("[data-row='fan-rank']")).toHaveLength(10);
  expect(container.querySelectorAll("[data-row='creator-rank']")).toHaveLength(10);
  expect(screen.getByRole("heading", { level: 2, name: "오늘의 랭킹" })).toBeInTheDocument();
  expect(screen.queryByRole("tab")).toBeNull();
  expect(screen.queryByText("포인트")).toBeNull();
  expect(screen.queryByText("전체 보기")).toBeNull();
  expect(container.querySelector("a[href*='/rankings']")).toBeNull();
  for (const [url] of fetcher.mock.calls) expect(String(url)).toMatch(/metric=(points|likes).*limit=10/);
});

it("signed out: ten rows per group, a row's picture and name lead to sign-in, one sign-in button", async () => {
  stub(fans(Array.from({ length: 10 }, (_, i) => fanRow(i + 1))), creators({ rows: Array.from({ length: 10 }, (_, i) => creatorRow(i + 1)) }));
  const { container } = render(<HomeRankingCard locale="ko" />);
  await screen.findByText("팬1");
  expect(container.querySelectorAll("[data-row='fan-rank']")).toHaveLength(10);
  expect(container.querySelectorAll("[data-row='creator-rank']")).toHaveLength(10);
  expect(container.querySelectorAll("[data-column='fans'] a[href*='/login']:not(li a)")).toHaveLength(1);
  expect(screen.getAllByRole("link", { name: "팬1, 로그인하고 프로필 보기" })[0]!.getAttribute("href")).toContain("/login");
  expect(container.querySelector("[data-rank-panel] a, [data-rank-panel] button")).toBeNull();
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("shows movement as a triangle right after the rank number on one line, no 신규 mark, no weekly column; today's gain and the way to first place only in the opened row", async () => {
  stub(fans([fanRow(1, { dayGain: 0, weekGain: 999, delta: 2 }), fanRow(2, { dayGain: -3 }), fanRow(3, { dayGain: null, isNew: true })]));
  const { container } = render(<HomeRankingCard locale="ko" />);
  await screen.findAllByText("팬1");
  const rows = container.querySelectorAll("[data-row='fan-rank']");
  expect(rows[0]!.querySelector("[data-delta-cell]")).toHaveAttribute("data-direction", "up");
  expect(rows[0]!.querySelector("[data-delta-cell]")!.previousElementSibling).toBe(rows[0]!.querySelector("[data-medal='1']"));
  expect(rows[0]!.querySelector("[title='팬1']")!.parentElement!.querySelector("[data-delta-cell]")).toBeNull();
  expect([...container.querySelectorAll("[data-row]")].map((row) => row.textContent).join(" ")).not.toMatch(/1위까지|현재 1위|1위와 동점|오늘/);
  expect(container.textContent).not.toContain("신규");
  expect(rows[2]!.querySelector("[data-delta-cell]")).toBeNull();
  expect(rows[0]!.textContent).not.toContain("999");
  fireEvent.click(rows[1]!.querySelector("button")!);
  expect(rows[1]!.querySelector("[data-rank-panel]")!.textContent).toContain("오늘−3");
  expect(rows[1]!.querySelector("[data-rank-panel]")!.textContent).toContain("1위까지1");
});

it("passes the original signed profile reference without replacing its stored rank", async () => {
  auth.value = { ...auth.value, authenticated: true, user: { id: "viewer" } };
  const ref = { kind: "home_ranking", day: "2026-11-08", computedAt: "2026-11-08T00:00:00Z", metric: "hearts", rank: 7, signature: "a".repeat(64) };
  stub(fans([fanRow(1, { profileRef: ref })]));
  render(<HomeRankingCard locale="ko" />);
  fireEvent.click(await screen.findByRole("button", { name: "팬1, 프로필 보기" }));
  expect(await screen.findByTestId("ranking-profile")).toHaveTextContent(JSON.stringify(ref));
  fireEvent.click(screen.getByRole("button", { name: "close profile" }));
  expect(screen.queryByTestId("ranking-profile")).toBeNull();
});

it("does not invent ranks for short/empty data and exposes retry on failure", async () => {
  let fail = true;
  vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL) => String(url).includes("kind=fans") && fail ? new Response("{}", { status: 503 }) : Response.json(String(url).includes("kind=fans") ? fans([fanRow(1)]) : creators({ rows: [] }))));
  const { container } = render(<HomeRankingCard locale="ko" />);
  expect(await screen.findByText("순위를 불러오지 못했어요")).toBeInTheDocument();
  expect(await screen.findByText("아직 순위가 없어요")).toBeInTheDocument();
  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  await screen.findByText("팬1");
  expect(container.querySelectorAll("[data-row='fan-rank']")).toHaveLength(1);
  expect(container.querySelector("[data-placeholder]")).toBeNull();
});

it.each(APP_LOCALES)("renders the home contract in %s", async locale => {
  stub(fans([fanRow(1, { dayGain: 0 })]));
  render(<HomeRankingCard locale={locale} />);
  expect(await screen.findByText("팬1")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: rankingsText(locale, "rkHomeTitle") })).toBeInTheDocument();
  expect(screen.queryByLabelText(rankingsText(locale, "rkDayGain", ["+0"]))).toBeNull();
  for (const key of ["rkHomeTitle", "rkHomeFans", "rkHomeLocked", "rkDayGain"] as const) {
    if (locale !== "ko" && locale !== "en") expect(messages[key][locale]).toBeTruthy();
  }
});

it("moves only changed rows on refresh and respects reduced motion", async () => {
  auth.value = { ...auth.value, authenticated: true, user: { id: "viewer" } };
  const animate = vi.fn(() => ({ cancel() {} }) as unknown as Animation);
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetTop");
  Object.defineProperty(HTMLElement.prototype, "offsetTop", { configurable: true, get(this: HTMLElement) { return this.parentElement ? Array.from(this.parentElement.children).indexOf(this) * 34 : 0; } });
  Element.prototype.animate = animate;
  const now = vi.spyOn(Date, "now");
  let clock = Date.parse("2026-11-08T03:00:00Z"); now.mockImplementation(() => clock);
  try {
    for (const reduced of [false, true]) {
      clearResources(); animate.mockClear(); window.localStorage.clear();
      vi.stubGlobal("matchMedia", () => ({ matches: reduced, addEventListener() {}, removeEventListener() {} }));
      let answer = fans([fanRow(1, { nickname: "가" }), fanRow(2, { nickname: "나" }), fanRow(3, { nickname: "다" })]);
      vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL) => Response.json(String(url).includes("kind=fans") ? answer : creators())));
      const view = render(<HomeRankingCard locale="ko" />);
      await screen.findByText("가");
      animate.mockClear(); // a first visit rings places 1-3 (own test below)
      answer = fans([fanRow(1, { nickname: "나" }), fanRow(2, { nickname: "가" }), fanRow(3, { nickname: "다" })]);
      clock += 11 * 60 * 1000;
      document.dispatchEvent(new Event("visibilitychange"));
      await waitFor(() => expect(view.container.querySelector("ol > li")!.textContent).toContain("나"));
      expect(animate.mock.calls.filter(call => JSON.stringify(call).includes("px)"))).toHaveLength(reduced ? 0 : 2);
      // The two rows whose value changed ring once (rotating arc + ring: 200ms in, 1s held, 600ms out = 1800ms, rows 90ms apart); reduced motion: the same ring without the rotation.
      expect(animate.mock.calls.filter(call => JSON.stringify(call).includes("rotate"))).toHaveLength(reduced ? 0 : 2);
      expect(animate.mock.calls.filter(call => JSON.stringify(call).includes("opacity") && JSON.stringify(call).includes('"duration":1800'))).toHaveLength(2);
      const ringDelays = animate.mock.calls.filter(call => JSON.stringify(call).includes('"duration":1800') && JSON.stringify(call).includes("opacity")).map(call => (call as unknown as [unknown, { delay?: number }])[1].delay ?? 0);
      expect(ringDelays).toEqual([0, 90]);
      view.unmount();
    }
  } finally {
    now.mockRestore();
    if (original) Object.defineProperty(HTMLElement.prototype, "offsetTop", original);
    delete (Element.prototype as Partial<Element>).animate;
  }
});

it("reads again every minute (60s plus jitter)", () => {
  expect(nextReadDelay(() => 0)).toBe(60000);
  expect(nextReadDelay(() => 0.999)).toBeLessThan(90000);
});

it("does not claim hidden ranks or draw login rows for short/empty answers", async () => {
  stub(fans([fanRow(1), fanRow(2)]), creators({ rows: [] }));
  render(<HomeRankingCard locale="ko" />);
  await screen.findByText("팬1");
  expect(screen.queryByRole("link", { name: "로그인하고 보기" })).toBeNull();
  expect(screen.queryByText(/6~10/)).toBeNull();
});

it("rings only the rows whose value changed between two answers of one visit", async () => {
  auth.value = { ...auth.value, authenticated: true, user: { id: "viewer" } };
  const animate = vi.fn(() => ({ cancel() {} }) as unknown as Animation);
  Element.prototype.animate = animate;
  const now = vi.spyOn(Date, "now");
  let clock = Date.parse("2026-11-08T03:00:00Z"); now.mockImplementation(() => clock);
  try {
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    let answer = fans([fanRow(1, { nickname: "가" }), fanRow(2, { nickname: "나" })]);
    vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL) => Response.json(String(url).includes("kind=fans") ? answer : creators())));
    const view = render(<HomeRankingCard locale="ko" />);
    await screen.findByText("가");
    animate.mockClear();
    answer = fans([fanRow(1, { nickname: "가" }), fanRow(2, { nickname: "나", hearts: 99, score: 99 })]);
    clock += 11 * 60 * 1000;
    document.dispatchEvent(new Event("visibilitychange"));
    await waitFor(() => expect(animate.mock.calls.filter(call => JSON.stringify(call).includes("rotate"))).toHaveLength(1));
    view.unmount();
  } finally {
    now.mockRestore();
    delete (Element.prototype as Partial<Element>).animate;
  }
});

it("a period change is not a value change: no ring (and no move) when the tabs switch to an answer the cache already holds", async () => {
  auth.value = { ...auth.value, authenticated: true, user: { id: "viewer" } };
  const animate = vi.fn(() => ({ cancel() {} }) as unknown as Animation);
  Element.prototype.animate = animate;
  try {
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    const answers = { all: fans([fanRow(1, { nickname: "가" }), fanRow(2, { nickname: "나" })]), day: fans([fanRow(1, { nickname: "가", hearts: 2, score: 2 }), fanRow(2, { nickname: "나", hearts: 1, score: 1 })]) };
    vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL) => Response.json(String(url).includes("kind=fans") ? (String(url).includes("period=day") ? answers.day : answers.all) : creators())));
    render(<HomeRankingCard locale="ko" />);
    await screen.findByText("가");
    const visit = async (names: string[]) => { for (const name of names) {
      fireEvent.click(screen.getAllByRole("button", { name }).find((b) => b.closest("nav"))!);
      await waitFor(() => expect(screen.getAllByText("가").length).toBeGreaterThan(0));
    } };
    await visit(["오늘", "누적"]); // the first look at each period is its own first visit
    animate.mockClear();
    await visit(["오늘", "누적", "오늘", "누적"]);
    expect(animate).not.toHaveBeenCalled();
  } finally {
    delete (Element.prototype as Partial<Element>).animate;
  }
});

it("rings places 1-3 once on a first visit, and afterwards only the rows that differ from what the visitor last saw", async () => {
  const animate = vi.fn(() => ({ cancel() {} }) as unknown as Animation);
  Element.prototype.animate = animate;
  const rotations = () => animate.mock.calls.filter(call => JSON.stringify(call).includes("rotate")).length;
  try {
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    const body = (second: number) => fans([fanRow(1, { nickname: "가", points: 50, hearts: 5 }), fanRow(2, { nickname: "나", points: second, hearts: 5 }), fanRow(3, { nickname: "다", points: 30, hearts: 5 }), fanRow(4, { nickname: "라", points: 20, hearts: 5 })]);
    const rowsOnly = () => ({ ...creators(), rows: [] });
    vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL) => Response.json(String(url).includes("kind=fans") ? body(40) : rowsOnly())));
    const first = render(<HomeRankingCard locale="ko" />);
    await screen.findByText("가");
    expect(rotations()).toBe(3);
    first.unmount();
    // The same values again: nothing rings.
    clearResources(); animate.mockClear();
    const again = render(<HomeRankingCard locale="ko" />);
    await screen.findByText("가");
    expect(rotations()).toBe(0);
    again.unmount();
    // One value moved since the last visit: only that row rings.
    clearResources(); animate.mockClear();
    vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL) => Response.json(String(url).includes("kind=fans") ? body(45) : rowsOnly())));
    render(<HomeRankingCard locale="ko" />);
    await screen.findByText("가");
    expect(rotations()).toBe(1);
  } finally {
    delete (Element.prototype as Partial<Element>).animate;
  }
});

it("shows points as the coin asset and likes as the heart asset, never the letter P or the word", async () => {
  stub(fans([fanRow(1, { nickname: "가", points: 7480 })]), creators({ rows: [creatorRow(1, { slug: "elina", name: "엘리나", likes: 105 })] }));
  const { container } = render(<HomeRankingCard locale="ko" />);
  await screen.findByText("가");
  const main = (kind: string) => container.querySelector(`li[data-row='${kind}-rank'] [data-metric]`) as HTMLElement;
  expect(main("fan").querySelector("img[src='/images/economy/point-coin.webp']")).not.toBeNull();
  expect(main("fan").textContent).toBe("7,480");
  expect(main("creator").querySelector("[data-icon='heart']")).not.toBeNull();
  expect(main("creator").textContent).toBe("105");
});

it("shows ▲▼ for a row that moved since the visitor last looked, and nothing for a row they had not seen", async () => {
  window.localStorage.setItem("kyaa:rank-seen2:fans:points:all", JSON.stringify({ v: { "n:가": 50, "n:나": 40 }, r: { "n:가": 2, "n:나": 1 } }));
  const answer = fans([fanRow(1, { nickname: "가", points: 50 }), fanRow(2, { nickname: "나", points: 40 }), fanRow(3, { nickname: "다", points: 30 })]);
  vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL) => Response.json(String(url).includes("kind=fans") ? answer : { ...creators(), rows: [] })));
  const { container } = render(<HomeRankingCard locale="ko" />);
  await screen.findByText("가");
  const mark = (name: string) => container.querySelector(`li[data-row='fan-rank']:has([title='${name}']) [data-delta-cell]`);
  expect(mark("가")?.getAttribute("aria-label")).toBe("1계단 올라감");
  expect(mark("나")?.getAttribute("aria-label")).toBe("1계단 내려감");
  expect(mark("다")).toBeNull();
});

it("the opened fan row shows the grade (badge and name), and a row without a grade leaves the cell out", async () => {
  stub(fans([fanRow(1, { tier: "Gold" }), fanRow(2, { tier: null })]));
  const { container } = render(<HomeRankingCard locale="ko" />);
  await screen.findAllByText("팬1");
  const rows = container.querySelectorAll("[data-row='fan-rank']");
  fireEvent.click(rows[0]!.querySelector("button")!);
  const panel = rows[0]!.querySelector("[data-rank-panel]")!;
  expect(panel.textContent).toContain("등급");
  expect(panel.textContent).toContain("골드");
  expect(panel.querySelector("img")).not.toBeNull();
  fireEvent.click(rows[1]!.querySelector("button")!);
  expect(rows[1]!.querySelector("[data-rank-panel]")!.textContent).not.toContain("등급");
});

it("a value that changes on a later read rolls (no invented increase); the first answer shows at once", async () => {
  const animate = vi.fn(() => ({ cancel() {} }) as unknown as Animation);
  Element.prototype.animate = animate;
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  try {
    clearResources();
    let answer = fans([fanRow(1, { nickname: "가", points: 120 })]);
    vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL) => Response.json(String(url).includes("kind=fans") ? answer : creators())));
    const view = render(<HomeRankingCard locale="ko" />);
    await screen.findByText("가");
    expect(animate.mock.calls.filter(call => JSON.stringify(call).includes("%)"))).toHaveLength(0);
    answer = fans([fanRow(1, { nickname: "가", points: 123 })]);
    const base = Date.now();
    const now = vi.spyOn(Date, "now");
    now.mockImplementation(() => base + 11 * 60 * 1000);
    document.dispatchEvent(new Event("visibilitychange"));
    await waitFor(() => expect(view.container.querySelector("[data-row='fan-rank'] [data-metric] [role='img']")?.getAttribute("aria-label")).toBe("123"));
    expect(animate.mock.calls.filter(call => JSON.stringify(call).includes("%)")).length).toBeGreaterThan(0);
    now.mockRestore();
  } finally { delete (Element.prototype as Partial<Element>).animate; }
});
