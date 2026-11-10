import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ value: { ready: true, authenticated: true, user: { id: "me" } as null | { id: string }, getAccessToken: async () => "t" } }));
vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => auth.value }));
const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/features/group-social/profile-modal", () => ({ ProfileModal: ({ person }: { person: { nickname: string } }) => <div role="dialog" aria-label={person.nickname} /> }));

import { clearResources } from "@/components/fan-ui/resource-cache";
import { CreatorRankingScreen } from "./rankings-screens";

const fanRow = (rank: number, extra: Record<string, unknown> = {}) => ({ rank, score: 60 - rank, hearts: 60 - rank, points: null, nickname: `하트팬${rank}`, characterId: "c1", tier: null, isMe: false, delta: null, favorite: null, weekGain: null, dayGain: 0, ...extra });
const creatorRow = (rank: number, extra: Record<string, unknown> = {}) => ({ rank, slug: `c${rank}`, name: `크리에이터${rank}`, imageUrl: null, score: 3, hearts: 40, fans: 3, challenge: false, delta: null, weekGain: null, dayGain: 0, ...extra });
const head = { state: "ready", day: "2026-11-09", computedAt: "2026-11-09T00:00:00Z", fetchedAt: "2026-11-09T00:01:00Z", comparable: true, weekGainDays: 7 };

function stub(rowsFor: (kind: string, limit: number) => number = (_, limit) => limit) {
  const fetcher = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input), "https://x");
    const kind = url.searchParams.get("kind")!, metric = url.searchParams.get("metric");
    const n = rowsFor(kind, Number(url.searchParams.get("limit")));
    return Response.json(kind === "creators"
      ? { ...head, metric, rows: Array.from({ length: n }, (_, i) => creatorRow(i + 1, i === 0 ? { slug: "elina", name: "엘리나", challenge: true, delta: 1, score: metric === "fans" ? 3 : 40 } : {})) }
      : { ...head, metric, rows: Array.from({ length: n }, (_, i) => fanRow(i + 1)), me: auth.value.authenticated ? { rank: 12, score: 3, hearts: 3, points: null, inTop: true, delta: 1 } : null });
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
const inRow = async (name: string) => (await screen.findAllByText(name)).find((n) => n.closest("li"))!;
const urls = (fetcher: ReturnType<typeof stub>) => fetcher.mock.calls.map(([input]) => String(input));

beforeEach(() => { router.replace.mockClear(); });
afterEach(() => { vi.unstubAllGlobals(); clearResources(); auth.value = { ...auth.value, authenticated: true, user: { id: "me" } }; });

function stubRows(fans: unknown[], creators: unknown[], me: unknown = null) {
  const fetcher = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input), "https://x");
    return Response.json(url.searchParams.get("kind") === "creators" ? { ...head, metric: url.searchParams.get("metric"), rows: creators } : { ...head, metric: url.searchParams.get("metric"), rows: fans, me });
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

it("reads both lists with 50 rows each, the same rows as the home card, with no period chips and no podium", async () => {
  const fetcher = stub();
  const { container } = render(<CreatorRankingScreen locale="ko" />);
  expect(await screen.findByRole("button", { name: "찐팬" })).toHaveAttribute("aria-pressed", "true");
  await screen.findByText("하트팬1");
  expect(urls(fetcher)).toContain("/api/rankings/home?kind=fans&metric=hearts&locale=ko&limit=50");
  expect(urls(fetcher)).toContain("/api/rankings/home?kind=creators&metric=hearts&locale=ko&limit=50");
  expect(urls(fetcher).some((url) => url.includes("/api/rankings/fans") || url.includes("period="))).toBe(false);
  expect(container.querySelectorAll("li[data-row='fan-rank']")).toHaveLength(50);
  expect(container.querySelector("[class*='podium']")).toBeNull();
  expect(screen.queryByRole("group", { name: "기간" })).toBeNull();
  // Numbers first: ranks 1-3 read as numbers (the medal artwork is not here yet).
  expect([...container.querySelectorAll("li[data-row='fan-rank'] [data-medal]")].map((n) => n.textContent)).toEqual(["1", "2", "3"]);
  // The metric stays reachable by touch and keyboard: the other metric is one press away.
  expect(screen.getAllByRole("button", { name: "하트" })[0]).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "포인트" })).toBeInTheDocument();
  // Signed in: my rank under the list.
  expect(screen.getByRole("status").textContent).toContain("12위");
});

it("opens on ?tab=creators&metric=fans, keeps the 찐팬 100 tag, and falls back to hearts for a metric the tab does not have", async () => {
  const fetcher = stub();
  const first = render(<CreatorRankingScreen locale="ko" initialTab="creators" initialMetric="fans" />);
  expect(await screen.findByRole("button", { name: "크리에이터" })).toHaveAttribute("aria-pressed", "true");
  const row = (await inRow("엘리나")).closest("li")!;
  expect(urls(fetcher)).toContain("/api/rankings/home?kind=creators&metric=fans&locale=ko&limit=50");
  expect(row.querySelector("[data-metric='fans']")).toHaveAttribute("aria-label", "찐팬 3");
  expect(row.textContent).toContain("찐팬 100 도전 중");
  first.unmount(); clearResources(); fetcher.mockClear();
  render(<CreatorRankingScreen locale="ko" initialTab="creators" initialMetric="points" />);
  await inRow("엘리나");
  expect(urls(fetcher)).toContain("/api/rankings/home?kind=creators&metric=hearts&locale=ko&limit=50");
});

it("a row reads movement, today's gain and the way to first place; the first row says so", async () => {
  stubRows(
    [], [
      creatorRow(1, { name: "일등", hearts: 12345, delta: 2, dayGain: 125, liveNow: true }),
      creatorRow(2, { name: "이등", hearts: 12345, delta: -1, dayGain: 0 }),
      creatorRow(3, { name: "삼등", hearts: 100, delta: 0, dayGain: null }),
      creatorRow(4, { name: "신규", hearts: 7, delta: null, isNew: true, dayGain: -2 }),
    ],
  );
  const view = render(<CreatorRankingScreen locale="ko" initialTab="creators" />);
  await inRow("일등");
  const row = (name: string) => view.container.querySelector(`li[data-row='creator-rank']:has([title='${name}'])`) as HTMLElement;
  expect(within(row("일등")).getByLabelText("2계단 올라감")).toBeInTheDocument();
  expect(row("일등").textContent).toContain("오늘 +125");
  expect(within(row("일등")).getByRole("img", { name: "일등 LIVE 중" })).toBeInTheDocument();
  expect(within(row("일등")).getByText("현재 1위")).toBeInTheDocument();
  expect(within(row("일등")).getByLabelText("하트 12,345개").textContent).toContain("1.2만");
  expect(within(row("이등")).getByLabelText("1계단 내려감")).toBeInTheDocument();
  expect(within(row("이등")).getByText("1위와 동점")).toBeInTheDocument();
  expect(within(row("삼등")).getByLabelText("변동 없음")).toBeInTheDocument();
  expect(row("삼등").textContent).not.toContain("오늘");
  expect(within(row("삼등")).getByText(/1위까지/)).toBeInTheDocument();
  expect(row("신규").querySelector("[data-direction='new']")?.textContent).toBe("신규");
  expect(row("신규").textContent).toContain("오늘 −2");
});

it("opens one row at a time with the action to the page, and closes it with the same row", async () => {
  stub();
  const view = render(<CreatorRankingScreen locale="ko" initialTab="creators" />);
  await inRow("엘리나");
  const rows = () => [...view.container.querySelectorAll("li[data-row='creator-rank'] > button")] as HTMLButtonElement[];
  expect(rows()[0]).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(rows()[0]!);
  expect(rows()[0]).toHaveAttribute("aria-expanded", "true");
  const panelId = rows()[0]!.getAttribute("aria-controls")!;
  expect(view.container.querySelector(`#${panelId}`)).not.toBeNull();
  expect(screen.getByRole("link", { name: "팬페이지 가기" })).toHaveAttribute("href", "/elina?locale=ko");
  fireEvent.click(rows()[1]!);
  expect(rows()[0]).toHaveAttribute("aria-expanded", "false");
  expect(rows()[1]).toHaveAttribute("aria-expanded", "true");
  expect(view.container.querySelectorAll("[data-rank-panel]")).toHaveLength(1);
  fireEvent.click(rows()[1]!);
  expect(view.container.querySelectorAll("[data-rank-panel]")).toHaveLength(0);
});

it("a signed-in fan row opens the profile window; a signed-out one leads to sign-in", async () => {
  stubRows([fanRow(1, { profileRef: { kind: "home_ranking", day: "2026-11-09", computedAt: "2026-11-09T00:00:00Z", metric: "hearts", rank: 1, signature: "s" } })], []);
  const view = render(<CreatorRankingScreen locale="ko" />);
  await screen.findByText("하트팬1");
  fireEvent.click(view.container.querySelector("li[data-row='fan-rank'] > button")!);
  fireEvent.click(screen.getByRole("button", { name: "프로필 보기" }));
  expect(await screen.findByRole("dialog", { name: "하트팬1" })).toBeInTheDocument();
  view.unmount(); clearResources();
  auth.value = { ...auth.value, authenticated: false, user: null };
  const guest = render(<CreatorRankingScreen locale="ko" />);
  await screen.findByText("하트팬1");
  fireEvent.click(guest.container.querySelector("li[data-row='fan-rank'] > button")!);
  const login = screen.getByRole("link", { name: "로그인하고 프로필 보기" });
  expect(decodeURIComponent(login.getAttribute("href")!)).toContain("/rankings?locale=ko&tab=fans&metric=hearts");
});

it("writes the tab and metric to the address without scrolling; a tab change goes to that tab's hearts", async () => {
  const fetcher = stub();
  render(<CreatorRankingScreen locale="ko" />);
  await screen.findByText("하트팬1");
  fireEvent.click(screen.getByRole("button", { name: "포인트" }));
  expect(router.replace).toHaveBeenLastCalledWith("/rankings?locale=ko&tab=fans&metric=points", { scroll: false });
  await waitFor(() => expect(urls(fetcher)).toContain("/api/rankings/home?kind=fans&metric=points&locale=ko&limit=50"));
  fireEvent.click(screen.getByRole("button", { name: "크리에이터" }));
  expect(router.replace).toHaveBeenLastCalledWith("/rankings?locale=ko&tab=creators&metric=hearts", { scroll: false });
  await inRow("엘리나");
});

it("signed out: the rows the API gives, no placeholders, and the one way to sign in back to the same tab and metric", async () => {
  auth.value = { ...auth.value, authenticated: false, user: null };
  stub((_, limit) => Math.min(limit, 5));
  const { container } = render(<CreatorRankingScreen locale="ko" initialTab="fans" initialMetric="points" />);
  await screen.findByText("하트팬1");
  expect(container.querySelectorAll("li[data-row='fan-rank']")).toHaveLength(5);
  const login = screen.getAllByRole("link", { name: "로그인하고 내 순위 보기" })[0]!;
  expect(login.getAttribute("href")).toContain("/login");
  expect(decodeURIComponent(login.getAttribute("href")!)).toContain("/rankings?locale=ko&tab=fans&metric=points");
  expect(container.querySelector("[data-placeholder]")).toBeNull();
});

it("a short list keeps its place with rank numbers and empty rings only, and a first-place highlight of what really changed", async () => {
  stubRows([fanRow(1, { dayGain: 3, delta: 5 }), fanRow(2, { dayGain: 9 }), fanRow(3)], [creatorRow(1, { dayGain: 1 })]);
  const { container } = render(<CreatorRankingScreen locale="ko" />);
  await inRow("하트팬1");
  const placeholders = [...container.querySelectorAll("[data-column='fans'] li[data-placeholder]")];
  expect(placeholders.map((n) => n.textContent)).toEqual(["4—", "5—", "6—", "7—", "8—", "9—", "10—"]);
  expect(container.querySelector("[data-column='fans'] [data-loading]")).toBeNull();
  const highlight = container.querySelector("[data-column='fans'] [data-rank-highlight]")!;
  expect(highlight.getAttribute("data-rank-highlight")).toBe("rise");
  expect(highlight.textContent).toContain("오늘 가장 많이 오름");
  expect(highlight.textContent).toContain("하트팬1");
});

it("while the first answer is read it shows loading rows and an empty frame, never placeholders or a highlight", async () => {
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
  const { container } = render(<CreatorRankingScreen locale="ko" />);
  expect(container.querySelectorAll("[data-column='fans'] li[data-row='fan-rank-loading']")).toHaveLength(10);
  expect(container.querySelector("[data-column='fans'] [data-placeholder]")).toBeNull();
  expect(container.querySelector("[data-column='fans'] [data-rank-highlight='loading']")).not.toBeNull();
});

it("an error draws no highlight and offers a retry that reads again", async () => {
  const fetcher = vi.fn(async () => new Response("no", { status: 503 }));
  vi.stubGlobal("fetch", fetcher);
  const { container } = render(<CreatorRankingScreen locale="ko" />);
  const retry = (await screen.findAllByRole("button", { name: "다시 시도" }))[0]!;
  expect(container.querySelector("[data-rank-highlight]")).toBeNull();
  const calls = fetcher.mock.calls.length;
  fireEvent.click(retry);
  await waitFor(() => expect(fetcher.mock.calls.length).toBeGreaterThan(calls));
});

it("counts the update line from the server time every ten seconds, stops hidden, and shows the Korean-time stamp after an hour or when stale", async () => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
  try {
    vi.setSystemTime(new Date("2026-11-09T00:00:30Z"));
    stubRows([fanRow(1)], [creatorRow(1)]);
    const view = render(<CreatorRankingScreen locale="ko" />);
    await vi.waitFor(() => expect(screen.getAllByText("30초 전 업데이트").length).toBeGreaterThan(0));
    expect(view.container.querySelector("[data-column='fans'] [data-metric-line]")!.textContent).toContain("누적 하트");
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(screen.getAllByText("40초 전 업데이트").length).toBeGreaterThan(0);
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(screen.getAllByText("1분 전 업데이트").length).toBeGreaterThan(0);
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(vi.getTimerCount()).toBeLessThan(2);
    act(() => { vi.setSystemTime(new Date("2026-11-09T01:30:00Z")); });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(screen.getAllByText("11. 09. 09:00 업데이트").length).toBeGreaterThan(0);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  } finally { vi.useRealTimers(); Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" }); }
});

it("shows the empty line, with the highlight saying nothing changed, when the day has no rows", async () => {
  stub(() => 0);
  const { container } = render(<CreatorRankingScreen locale="ko" />);
  expect((await screen.findAllByText("아직 순위가 없어요")).length).toBe(2);
  expect(container.querySelector("[data-column='fans'] [data-rank-highlight='none']")).not.toBeNull();
});
