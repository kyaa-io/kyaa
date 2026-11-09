import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ value: { ready: true, authenticated: true, user: { id: "me" } as null | { id: string }, getAccessToken: async () => "t" } }));
vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => auth.value }));
const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { clearResources } from "@/components/fan-ui/resource-cache";
import { CreatorRankingScreen } from "./rankings-screens";

const fanRow = (rank: number, extra: Record<string, unknown> = {}) => ({ rank, score: 60 - rank, hearts: 60 - rank, points: null, nickname: `하트팬${rank}`, characterId: "c1", tier: null, isMe: false, delta: null, favorite: null, weekGain: null, ...extra });
const creatorRow = (rank: number, extra: Record<string, unknown> = {}) => ({ rank, slug: `c${rank}`, name: `크리에이터${rank}`, imageUrl: null, score: 3, hearts: 40, fans: 3, challenge: false, delta: null, weekGain: null, ...extra });
const head = { state: "ready", day: "2026-11-09", computedAt: "2026-11-09T00:00:00Z", fetchedAt: "2026-11-09T00:01:00Z", comparable: true, weekGainDays: 7 };

function stub(rowsFor: (kind: string, limit: number) => number = (_, limit) => limit) {
  const fetcher = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input), "https://x");
    const kind = url.searchParams.get("kind")!, metric = url.searchParams.get("metric");
    const n = rowsFor(kind, Number(url.searchParams.get("limit")));
    return Response.json(kind === "creators"
      ? { ...head, metric, rows: Array.from({ length: n }, (_, i) => creatorRow(i + 1, i === 0 ? { slug: "elina", name: "엘리나", challenge: true, score: metric === "fans" ? 3 : 40 } : {})) }
      : { ...head, metric, rows: Array.from({ length: n }, (_, i) => fanRow(i + 1)), me: auth.value.authenticated ? { rank: 12, score: 3, hearts: 3, points: null, inTop: true, delta: 1 } : null });
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
const urls = (fetcher: ReturnType<typeof stub>) => fetcher.mock.calls.map(([input]) => String(input));

beforeEach(() => { router.replace.mockClear(); });
afterEach(() => { vi.unstubAllGlobals(); clearResources(); auth.value = { ...auth.value, authenticated: true, user: { id: "me" } }; });

it("reads the home day table with 50 rows, the same rows as the home card, no period chips and no podium", async () => {
  const fetcher = stub();
  const { container } = render(<CreatorRankingScreen locale="ko" />);
  expect(await screen.findByRole("tab", { name: "팬 랭킹" })).toHaveAttribute("aria-selected", "true");
  await screen.findByText("하트팬1");
  expect(urls(fetcher)).toContain("/api/rankings/home?kind=fans&metric=hearts&locale=ko&limit=50");
  expect(urls(fetcher).some((url) => url.includes("/api/rankings/fans") || url.includes("period="))).toBe(false);
  expect(container.querySelectorAll("li[data-row='fan-rank']")).toHaveLength(50);
  expect(container.querySelector("[class*='podium']")).toBeNull();
  expect(screen.queryByRole("group", { name: "기간" })).toBeNull();
  expect(screen.queryByRole("button", { name: "주간" })).toBeNull();
  // Ranks 1-3 carry the medal colour in the row itself.
  expect([...container.querySelectorAll("[data-medal]")].map((n) => n.textContent)).toEqual(["1", "2", "3"]);
  expect(screen.getByRole("button", { name: "하트" })).toHaveAttribute("aria-pressed", "true");
  // Signed in: my rank under the list.
  expect(screen.getByRole("status").textContent).toContain("12위");
});

it("opens on ?tab=creators&metric=fans, and falls back to hearts for a metric the tab does not have", async () => {
  const fetcher = stub();
  const first = render(<CreatorRankingScreen locale="ko" initialTab="creators" initialMetric="fans" />);
  expect(await screen.findByRole("tab", { name: "크리에이터 랭킹" })).toHaveAttribute("aria-selected", "true");
  const row = await screen.findByRole("link", { name: /엘리나/ });
  expect(urls(fetcher)).toContain("/api/rankings/home?kind=creators&metric=fans&locale=ko&limit=50");
  expect(row.querySelector("[data-metric='fans']")).toHaveAttribute("aria-label", "찐팬 3");
  expect(within(row).getByLabelText("하트 40개")).toBeInTheDocument();
  expect(row.textContent).toContain("찐팬 100 도전 중");
  first.unmount(); clearResources(); fetcher.mockClear();
  render(<CreatorRankingScreen locale="ko" initialTab="creators" initialMetric="points" />);
  await screen.findByRole("link", { name: /엘리나/ });
  expect(urls(fetcher)).toContain("/api/rankings/home?kind=creators&metric=hearts&locale=ko&limit=50");
});

it("writes the tab and metric to the address without scrolling; a tab change goes to that tab's hearts", async () => {
  const fetcher = stub();
  render(<CreatorRankingScreen locale="ko" />);
  await screen.findByText("하트팬1");
  fireEvent.click(screen.getByRole("button", { name: "포인트" }));
  expect(router.replace).toHaveBeenLastCalledWith("/rankings?locale=ko&tab=fans&metric=points", { scroll: false });
  await waitFor(() => expect(urls(fetcher)).toContain("/api/rankings/home?kind=fans&metric=points&locale=ko&limit=50"));
  fireEvent.click(screen.getByRole("tab", { name: "크리에이터 랭킹" }));
  expect(router.replace).toHaveBeenLastCalledWith("/rankings?locale=ko&tab=creators&metric=hearts", { scroll: false });
  await screen.findByRole("link", { name: /엘리나/ });
});

it("signed out: the five rows the API gives and the way to sign in back to the same tab and metric", async () => {
  auth.value = { ...auth.value, authenticated: false, user: null };
  stub((_, limit) => Math.min(limit, 5));
  const { container } = render(<CreatorRankingScreen locale="ko" initialTab="fans" initialMetric="points" />);
  await screen.findByText("하트팬1");
  expect(container.querySelectorAll("li[data-row='fan-rank']")).toHaveLength(5);
  const login = screen.getByRole("link", { name: /로그인하고 내 순위 보기/ });
  expect(login.getAttribute("href")).toContain("/login");
  expect(decodeURIComponent(login.getAttribute("href")!)).toContain("/rankings?locale=ko&tab=fans&metric=points");
  expect(container.querySelector("[data-placeholder]")).toBeNull();
});

it("shows the empty line when the day has no rows", async () => {
  stub(() => 0);
  render(<CreatorRankingScreen locale="ko" />);
  expect(await screen.findByText("아직 순위가 없어요")).toBeInTheDocument();
});
