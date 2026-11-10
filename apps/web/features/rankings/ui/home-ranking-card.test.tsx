import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ value: { ready: true, authenticated: false, user: null as null | { id: string }, getAccessToken: async () => "t" } }));
vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => auth.value }));

vi.mock("@/features/group-social/profile-modal", () => ({ ProfileModal: ({ person, onClose }: { person: { ref: unknown }; onClose: () => void }) => <div data-testid="ranking-profile">{JSON.stringify(person.ref)}<button onClick={onClose}>close profile</button></div> }));

import { clearResources } from "@/components/fan-ui/resource-cache";
import { HomeRankingCard, updatedLabel } from "./home-ranking-card";
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

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); clearResources(); auth.value = { ...auth.value, authenticated: false, user: null }; });

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

it("requests ten heart ranks per group, keeps full leaderboard choices out of home", async () => {
  auth.value = { ...auth.value, authenticated: true, user: { id: "viewer" } };
  const fetcher = stub(fans(Array.from({ length: 10 }, (_, i) => fanRow(i + 1))), creators({ rows: Array.from({ length: 10 }, (_, i) => creatorRow(i + 1)) }));
  const { container } = render(<HomeRankingCard locale="ko" />);
  await screen.findByText("팬10");
  expect(container.querySelectorAll("[data-row='fan-rank']")).toHaveLength(10);
  expect(container.querySelectorAll("[data-row='creator-rank']")).toHaveLength(10);
  expect(screen.queryByRole("tab")).toBeNull();
  expect(screen.queryByText("포인트")).toBeNull();
  for (const [url] of fetcher.mock.calls) expect(String(url)).toMatch(/metric=hearts.*limit=10/);
  expect(screen.getAllByRole("link", { name: "전체 보기" })).toHaveLength(1);
});

it("shows ten guest ranks and sends fan profiles to login", async () => {
  stub(fans(Array.from({ length: 10 }, (_, i) => fanRow(i + 1))), creators({ rows: Array.from({ length: 10 }, (_, i) => creatorRow(i + 1)) }));
  const { container } = render(<HomeRankingCard locale="ko" />);
  await screen.findByText("팬1");
  expect(container.querySelectorAll("[data-row='fan-rank']")).toHaveLength(10);
  expect(container.querySelectorAll("[data-row='creator-rank']")).toHaveLength(10);
  expect(screen.getByText("팬6")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "팬1" }).getAttribute("href")).toContain("/login");
  expect(container.querySelector("[data-row='creator-rank'] a")).toHaveAttribute("href", "/c1?locale=ko");
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("places movement after the name, preserves measured daily values and no fan point column", async () => {
  stub(fans([fanRow(1, { dayGain: 0, weekGain: 999, delta: 2 }), fanRow(2, { dayGain: -3 }), fanRow(3, { dayGain: null, isNew: true })]));
  const { container } = render(<HomeRankingCard locale="ko" />);
  await screen.findByText("팬1");
  const rows = container.querySelectorAll("[data-row='fan-rank']");
  const first = rows[0]!.querySelector("a,button")!;
  expect(first.children[2]?.querySelector("[title]")?.textContent).toBe("팬1");
  expect(first.children[2]?.querySelector("[data-delta-cell] svg")).toHaveAttribute("data-icon-set", "lucide");

  expect(container.querySelector("[data-metric='fans']")).toBeNull();
  expect(container.querySelector("[data-day-gain]")).toBeNull();
  expect(rows[2]!.querySelector("[data-delta-cell] [role=img]")).toBeNull();
  expect(rows[1]!.querySelector("[data-direction='new']")).toBeNull();
  expect(first.textContent).not.toContain("999");
});

it("passes the original signed profile reference without replacing its stored rank", async () => {
  auth.value = { ...auth.value, authenticated: true, user: { id: "viewer" } };
  const ref = { kind: "home_ranking", day: "2026-11-08", computedAt: "2026-11-08T00:00:00Z", metric: "hearts", rank: 7, signature: "a".repeat(64) };
  stub(fans([fanRow(1, { profileRef: ref })]));
  render(<HomeRankingCard locale="ko" />);
  fireEvent.click(await screen.findByRole("button", { name: "팬1" }));
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
  const animate = vi.fn(() => ({}) as Animation);
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetTop");
  Object.defineProperty(HTMLElement.prototype, "offsetTop", { configurable: true, get(this: HTMLElement) { return this.parentElement ? Array.from(this.parentElement.children).indexOf(this) * 34 : 0; } });
  Element.prototype.animate = animate;
  const now = vi.spyOn(Date, "now");
  let clock = Date.parse("2026-11-08T03:00:00Z"); now.mockImplementation(() => clock);
  try {
    for (const reduced of [false, true]) {
      clearResources(); animate.mockClear();
      vi.stubGlobal("matchMedia", () => ({ matches: reduced, addEventListener() {}, removeEventListener() {} }));
      let answer = fans([fanRow(1, { nickname: "가" }), fanRow(2, { nickname: "나" }), fanRow(3, { nickname: "다" })]);
      vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL) => Response.json(String(url).includes("kind=fans") ? answer : creators())));
      const view = render(<HomeRankingCard locale="ko" />);
      await screen.findByText("가");
      expect(animate).not.toHaveBeenCalled();
      answer = fans([fanRow(1, { nickname: "나" }), fanRow(2, { nickname: "가" }), fanRow(3, { nickname: "다" })]);
      clock += 11 * 60 * 1000;
      document.dispatchEvent(new Event("visibilitychange"));
      await waitFor(() => expect(view.container.querySelector("ol > li")!.textContent).toContain("나"));
      expect(animate.mock.calls.filter(call => JSON.stringify(call).includes("translateY"))).toHaveLength(reduced ? 0 : 2);
      view.unmount();
    }
  } finally {
    now.mockRestore();
    if (original) Object.defineProperty(HTMLElement.prototype, "offsetTop", original);
    delete (Element.prototype as Partial<Element>).animate;
  }
});

it("retains snapshot dates and server-clock refresh timing", () => {
  const now = new Date(2026, 10, 8, 15, 0);
  expect(updatedLabel("ko", new Date(2026, 10, 7, 23, 50).toISOString(), now)).toContain("11. 7.");
  expect(updatedLabel("ko", "bad", now)).toBeNull();
  expect(nextReadDelay("2026-11-08T00:09:00Z", "2026-11-08T00:00:00Z", () => 0)).toBe(60000);
});

it("does not claim hidden ranks or draw login rows for short/empty answers", async () => {
  stub(fans([fanRow(1), fanRow(2)]), creators({ rows: [] }));
  render(<HomeRankingCard locale="ko" />);
  await screen.findByText("팬1");
  expect(screen.queryByRole("link", { name: "로그인하고 보기" })).toBeNull();
  expect(screen.queryByText(/6~10/)).toBeNull();
});
