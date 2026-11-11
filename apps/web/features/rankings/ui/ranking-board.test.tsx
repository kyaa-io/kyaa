import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ value: { ready: true, authenticated: true, user: { id: "me" } as null | { id: string }, getAccessToken: async () => "t" } }));
vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => auth.value }));
vi.mock("@/features/group-social/profile-modal", () => ({ ProfileModal: ({ person }: { person: { nickname: string } }) => <div role="dialog" aria-label={person.nickname} /> }));

import { clearResources } from "@/components/fan-ui/resource-cache";
import { RankingBoard } from "./ranking-board";

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

afterEach(() => { vi.unstubAllGlobals(); clearResources(); auth.value = { ...auth.value, authenticated: true, user: { id: "me" } }; });

function stubRows(fans: unknown[], creators: unknown[], me: unknown = null) {
  const fetcher = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input), "https://x");
    return Response.json(url.searchParams.get("kind") === "creators" ? { ...head, metric: url.searchParams.get("metric"), rows: creators } : { ...head, metric: url.searchParams.get("metric"), rows: fans, me });
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

it("reads both lists with ten heart rows each, one under the other: no tabs, no metric choice, no period chips, no podium", async () => {
  const fetcher = stub();
  const { container } = render(<RankingBoard locale="ko" />);
  await screen.findByText("하트팬1");
  expect(urls(fetcher)).toContain("/api/rankings/home?kind=fans&metric=points&locale=ko&limit=10");
  expect(urls(fetcher)).toContain("/api/rankings/home?kind=creators&metric=likes&locale=ko&limit=10");
  expect(urls(fetcher).some((url) => url.includes("/api/rankings/fans") || url.includes("period="))).toBe(false);
  expect(container.querySelectorAll("li[data-row='fan-rank']")).toHaveLength(10);
  expect(container.querySelectorAll("li[data-row='creator-rank']")).toHaveLength(10);
  expect([...container.querySelectorAll("[data-column]")].map((n) => n.getAttribute("data-column"))).toEqual(["fans", "creators"]);
  expect(screen.getByRole("heading", { name: "찐팬" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "크리에이터" })).toBeInTheDocument();
  expect(screen.queryByRole("tab")).toBeNull();
  expect(screen.queryByRole("button", { name: "포인트" })).toBeNull();
  expect(screen.queryByRole("button", { name: "찐팬 수" })).toBeNull();
  expect(screen.queryByRole("group", { name: "기간" })).toBeNull();
  expect(container.querySelector("[class*='podium']")).toBeNull();
  // 대표 11/11 01:55: fans by points, creators by page likes; no heart value on a row.
  expect(container.querySelector("[data-metric='hearts']")).toBeNull();
  expect(container.querySelector("[data-metric='fans']")).toBeNull();
  expect(container.querySelector("a[href*='/rankings']")).toBeNull();
  // Numbers first: ranks 1-3 read as numbers (the medal artwork is not here yet).
  expect([...container.querySelectorAll("li[data-row='fan-rank'] [data-medal]")].map((n) => n.textContent)).toEqual(["1", "2", "3"]);
  // Signed in: my rank under the fan list.
  expect(screen.getByRole("status").textContent).toContain("12위");
});

it("keeps the 찐팬 100 tag on the creator row and counts page likes", async () => {
  stub();
  render(<RankingBoard locale="ko" />);
  const row = (await inRow("엘리나")).closest("li")!;
  expect(row.querySelector("[data-metric='likes']")).toHaveAttribute("aria-label", "좋아요 40");
  expect(row.textContent).toContain("찐팬 100 도전 중");
});

it("a row is one line: movement beside the name, LIVE, the value; today's gain and the way to first place are left to the opened row", async () => {
  stubRows(
    [], [
      creatorRow(1, { name: "일등", likes: 12345, delta: 2, dayGain: 125, liveNow: true }),
      creatorRow(2, { name: "이등", likes: 12345, delta: -1, dayGain: 0 }),
      creatorRow(3, { name: "삼등", likes: 100, delta: 0, dayGain: null }),
      creatorRow(4, { name: "새얼굴", likes: 7, delta: null, isNew: true, dayGain: -2 }),
    ],
  );
  const view = render(<RankingBoard locale="ko" />);
  await inRow("일등");
  const row = (name: string) => view.container.querySelector(`li[data-row='creator-rank']:has([title='${name}'])`) as HTMLElement;
  expect(within(row("일등")).getByLabelText("2계단 올라감")).toBeInTheDocument();
  expect(within(row("일등")).getByRole("img", { name: "일등 LIVE 중" })).toBeInTheDocument();
  expect(within(row("일등")).getByLabelText("좋아요 12,345").textContent).toContain("1.2만");
  expect(within(row("이등")).getByLabelText("1계단 내려감")).toBeInTheDocument();
  expect([...view.container.querySelectorAll("[data-row]")].map((row) => row.textContent).join(" ")).not.toMatch(/오늘|1위까지|현재 1위|1위와 동점/);
  expect(row("삼등").querySelector("[data-delta-cell]")).toBeNull();
  expect(row("이등").textContent).not.toContain("오늘");
  expect(row("일등").querySelector("[data-metric] [data-icon='heart']")).not.toBeNull();
  fireEvent.click(row("삼등").querySelector("button")!);
  expect(row("삼등").querySelector("[data-rank-panel]")!.textContent).toContain("1위까지12,245");
  expect(row("삼등").querySelector("[data-rank-panel]")!.textContent).not.toContain("오늘");
  expect(row("새얼굴").textContent).not.toContain("신규");
  expect(row("새얼굴").querySelector("[data-direction='new']")).toBeNull();
  expect(row("새얼굴").querySelector("[data-direction]")).toBeNull();
  fireEvent.click(row("새얼굴").querySelector("button")!);
  expect(row("새얼굴").querySelector("[data-rank-panel]")!.textContent).toContain("오늘−2");
});

it("opens one row at a time with the action to the page, and closes it with the same row", async () => {
  stub();
  const view = render(<RankingBoard locale="ko" />);
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
  const view = render(<RankingBoard locale="ko" />);
  await screen.findByText("하트팬1");
  fireEvent.click(view.container.querySelector("li[data-row='fan-rank'] > button")!);
  fireEvent.click(screen.getByRole("button", { name: "프로필 보기" }));
  expect(await screen.findByRole("dialog", { name: "하트팬1" })).toBeInTheDocument();
  view.unmount(); clearResources();
  auth.value = { ...auth.value, authenticated: false, user: null };
  const guest = render(<RankingBoard locale="ko" />);
  await screen.findByText("하트팬1");
  fireEvent.click(guest.container.querySelector("li[data-row='fan-rank'] > button")!);
  const login = screen.getByRole("link", { name: "로그인하고 프로필 보기" });
  expect(decodeURIComponent(login.getAttribute("href")!)).toContain("/?locale=ko");
});

it("signed out: the rows the API gives, no placeholders, and one way to sign in back to the home page", async () => {
  auth.value = { ...auth.value, authenticated: false, user: null };
  stub((_, limit) => Math.min(limit, 5));
  const { container } = render(<RankingBoard locale="ko" />);
  await screen.findByText("하트팬1");
  expect(container.querySelectorAll("li[data-row='fan-rank']")).toHaveLength(5);
  const logins = screen.getAllByRole("link", { name: "로그인하고 내 순위 보기" });
  // One under the 찐팬 list; the 크리에이터 tab has its own on a phone (hidden from 1024px, where the pair has one).
  expect(logins).toHaveLength(2);
  expect(container.querySelectorAll("[data-column='fans'] [data-ranking-foot]")).toHaveLength(1);
  expect(container.querySelectorAll("[data-column='creators'] [data-ranking-foot]")).toHaveLength(1);
  expect(logins[0]!.getAttribute("href")).toContain("/login");
  expect(decodeURIComponent(logins[0]!.getAttribute("href")!)).toContain("/?locale=ko");
  expect(container.querySelector("[data-placeholder]")).toBeNull();
});

it("a short list keeps its place with rank numbers and empty rings only, and a first-place highlight of what really changed", async () => {
  stubRows([fanRow(1, { dayGain: 3, delta: 5 }), fanRow(2, { dayGain: 9 }), fanRow(3)], [creatorRow(1, { dayGain: 1 })]);
  const { container } = render(<RankingBoard locale="ko" />);
  await inRow("하트팬1");
  const placeholders = [...container.querySelectorAll("[data-column='fans'] li[data-placeholder]")];
  expect(placeholders.map((n) => n.textContent)).toEqual(["4", "5", "6", "7", "8", "9", "10"]);
  expect(container.querySelector("[data-column='fans'] [data-loading]")).toBeNull();
  const highlight = container.querySelector("[data-column='fans'] [data-rank-highlight]")!;
  expect(highlight.getAttribute("data-rank-highlight")).toBe("rise");
  expect(highlight.textContent).toContain("오늘 가장 많이 오름");
  expect(highlight.textContent).toContain("하트팬1");
});

it("while the first answer is read it shows loading rows and an empty frame, never placeholders or a highlight", async () => {
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
  const { container } = render(<RankingBoard locale="ko" />);
  expect(container.querySelectorAll("[data-column='fans'] li[data-row='fan-rank-loading']")).toHaveLength(10);
  expect(container.querySelector("[data-column='fans'] [data-placeholder]")).toBeNull();
  expect(container.querySelector("[data-column='fans'] [data-rank-highlight='loading']")).not.toBeNull();
});

it("an error draws no highlight and offers a retry that reads again", async () => {
  const fetcher = vi.fn(async () => new Response("no", { status: 503 }));
  vi.stubGlobal("fetch", fetcher);
  const { container } = render(<RankingBoard locale="ko" />);
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
    const view = render(<RankingBoard locale="ko" />);
    await vi.waitFor(() => expect(screen.getAllByText("30초 전 업데이트").length).toBeGreaterThan(0));
    expect(view.container.querySelector("[data-column='fans'] [data-metric-line]")!.textContent).toContain("누적 포인트");
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

it("shows the empty line and no highlight when the day has no rows", async () => {
  stub(() => 0);
  const { container } = render(<RankingBoard locale="ko" />);
  expect((await screen.findAllByText("아직 순위가 없어요")).length).toBe(2);
  expect(container.querySelector("[data-rank-highlight]")).toBeNull();
});

it("a day where nothing moved and nobody gained hearts draws no highlight, and no 변동 없음 line", async () => {
  stubRows([fanRow(1), fanRow(2)], [creatorRow(1)]);
  const { container } = render(<RankingBoard locale="ko" />);
  await inRow("하트팬1");
  expect(container.querySelector("[data-rank-highlight]")).toBeNull();
  expect(container.textContent).not.toContain("변동 없음 ·");
  expect(screen.queryByText("오늘 가장 많이 오름")).toBeNull();
});

it("draws no dead value anywhere: no 신규, no — mark, no +0, no 변동 없음, and no my-rank line without a rank", async () => {
  stubRows(
    [fanRow(1, { dayGain: 0, delta: 0 }), fanRow(2, { dayGain: null, delta: null, isNew: true }), fanRow(3, { dayGain: 0 })],
    [creatorRow(1, { dayGain: 0, delta: 0 }), creatorRow(2, { dayGain: 0, delta: null, isNew: true })],
    null,
  );
  const { container } = render(<RankingBoard locale="ko" />);
  await inRow("하트팬1");
  const text = container.textContent!;
  for (const dead of ["신규", "—", "+0", "변동 없음"]) expect(text).not.toContain(dead);
  expect(container.querySelector("[data-delta-cell]")).toBeNull();
  expect(container.querySelector("[data-ranking-foot]")).toBeNull();
  expect(container.querySelector("[data-rank-highlight]")).toBeNull();
});

it("period pills: 누적 is the default; 오늘 and 7일 read the period list, drop the highlight, the placeholders and the day gain under the name", async () => {
  const fetcher = stub();
  const { container } = render(<RankingBoard locale="ko" />);
  await screen.findByText("하트팬1");
  const pill = (name: string) => screen.getByRole("button", { name });
  expect(["오늘", "7일", "누적"].map((n) => pill(n).getAttribute("aria-pressed"))).toEqual(["false", "false", "true"]);
  expect(urls(fetcher).some((u) => u.includes("period="))).toBe(false);
  expect(container.querySelector("[data-rank-highlight]")).not.toBeNull();
  fireEvent.click(pill("오늘"));
  await waitFor(() => expect(urls(fetcher)).toContain("/api/rankings/home?kind=fans&metric=points&locale=ko&limit=10&period=day"));
  expect(urls(fetcher)).toContain("/api/rankings/home?kind=creators&metric=likes&locale=ko&limit=10&period=day");
  await screen.findByText("하트팬1");
  expect(pill("오늘").getAttribute("aria-pressed")).toBe("true");
  expect(container.querySelector("[data-column='fans'] [data-metric-line]")!.textContent).toContain("오늘 모은 포인트");
  expect(container.querySelector("[data-column='creators'] [data-metric-line]")!.textContent).toContain("오늘 받은 좋아요");
  expect(container.querySelector("[data-rank-highlight]")).toBeNull();
  expect(container.querySelector("li[data-placeholder]")).toBeNull();
  expect(container.textContent).not.toContain("오늘 +");
  fireEvent.click(pill("7일"));
  await waitFor(() => expect(urls(fetcher)).toContain("/api/rankings/home?kind=fans&metric=points&locale=ko&limit=10&period=week"));
  await waitFor(() => expect(container.querySelector("[data-column='fans'] [data-metric-line]")!.textContent).toContain("7일간 모은 포인트"));
  fireEvent.click(pill("누적"));
  await waitFor(() => expect(container.querySelector("[data-column='fans'] [data-metric-line]")!.textContent).toContain("누적 포인트"));
});

it("a period with nobody gaining shows the empty line and no pill is lost", async () => {
  stubRows([], [], null);
  render(<RankingBoard locale="ko" />);
  fireEvent.click(screen.getByRole("button", { name: "오늘" }));
  expect((await screen.findAllByText("아직 순위가 없어요")).length).toBe(2);
  expect(screen.getByRole("button", { name: "누적" })).toBeInTheDocument();
});

it("a phone reads one list at a time behind the 찐팬 | 크리에이터 segment; both stay in the page for the two-column desktop", async () => {
  stub();
  const { container } = render(<RankingBoard locale="ko" />);
  await screen.findByText("하트팬1");
  const column = (name: string) => container.querySelector(`[data-column='${name}']`)!;
  expect(column("fans").getAttribute("data-active")).toBe("true");
  expect(column("creators").getAttribute("data-active")).toBe("false");
  const tab = (name: string) => screen.getAllByRole("button", { name }).find((b) => b.hasAttribute("aria-pressed") && !b.closest("li"))!;
  expect(tab("찐팬").getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(tab("크리에이터"));
  expect(column("creators").getAttribute("data-active")).toBe("true");
  expect(column("fans").getAttribute("data-active")).toBe("false");
  expect(column("fans").querySelectorAll("li[data-row='fan-rank']").length).toBeGreaterThan(0);
});

it("movement stands right after the name: ▲ green and ▼ red, hidden when the row did not move", async () => {
  stubRows([fanRow(1, { delta: 3 }), fanRow(2, { delta: -2 }), fanRow(3, { delta: 0 }), fanRow(4, { delta: null })], [creatorRow(1, { delta: 1 })]);
  const { container } = render(<RankingBoard locale="ko" />);
  await inRow("하트팬1");
  const line = (name: string) => container.querySelector(`li [title='${name}']`)!.parentElement!;
  expect(line("하트팬1").querySelector("[data-direction='up']")?.textContent).toBe("3");
  expect(line("하트팬2").querySelector("[data-direction='down']")?.textContent).toBe("2");
  expect(line("하트팬3").querySelector("[data-delta-cell]")).toBeNull();
  expect(line("하트팬4").querySelector("[data-delta-cell]")).toBeNull();
  expect(line("하트팬1").firstElementChild).toBe(container.querySelector("li [title='하트팬1']"));
});

it("draws no gauge bar on any row, and no way-to-first text in the line", async () => {
  stub();
  const { container } = render(<RankingBoard locale="ko" />);
  await screen.findByText("하트팬1");
  expect(container.querySelector("[class*='share']")).toBeNull();
  expect(container.querySelector("[role='progressbar'], progress, meter")).toBeNull();
  expect(container.querySelector("li[data-row='fan-rank'] [class*='gap']")).toBeNull();
});

it("opens a fan row with hearts and entry tickets, a creator row with 찐팬 and hearts; zero stays out and no follower count is made up", async () => {
  stubRows(
    [fanRow(1, { points: 900, score: 900, hearts: 12, tickets: 3, totalPoints: 900 }), fanRow(2, { nickname: "빈팬", points: 400, score: 400, hearts: 0, tickets: 0, totalPoints: 400 })],
    [creatorRow(1, { name: "좋아요일등", likes: 50, score: 50, hearts: 77, fans: 9, totalLikes: 50 })],
  );
  const view = render(<RankingBoard locale="ko" />);
  await inRow("좋아요일등");
  const fan = view.container.querySelector("li[data-row='fan-rank']:has([title='하트팬1'])") as HTMLElement;
  fireEvent.click(fan.querySelector("button")!);
  const fanPanel = fan.querySelector("[data-rank-panel]")!.textContent!;
  expect(fanPanel).toContain("하트12");
  expect(fanPanel).toContain("응모권3");
  const empty = view.container.querySelector("li[data-row='fan-rank']:has([title='빈팬'])") as HTMLElement;
  fireEvent.click(empty.querySelector("button")!);
  expect(empty.querySelector("[data-rank-panel]")!.textContent).not.toMatch(/하트|응모권/);
  const creator = view.container.querySelector("li[data-row='creator-rank']:has([title='좋아요일등'])") as HTMLElement;
  expect(creator.querySelector("[data-metric='likes']")).toHaveAttribute("aria-label", "좋아요 50");
  fireEvent.click(creator.querySelector("button")!);
  const creatorPanel = creator.querySelector("[data-rank-panel]")!.textContent!;
  expect(creatorPanel).toContain("찐팬9명");
  expect(creatorPanel).toContain("하트77");
  expect(creatorPanel).not.toMatch(/팔로워/);
});
