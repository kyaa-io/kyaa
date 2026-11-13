import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

// 261107-2 U5: the 덕질 tab folds its missions — today (check-in + daily-limit activities, open), more (closed), certifications (closed).
const rules = { checkin: { points: 2 }, post: { points: 20, dailyLimit: 3 }, comment: { points: 3, dailyLimit: 10 }, share: { points: 10, dailyLimit: 3 }, reaction: { points: 1, dailyLimit: 5 }, invite: { points: 200, dailyLimit: null, pointCap: { max: 5, per: "user_month" } }, quiz: { points: 20, dailyLimit: null }, proof: { points: 100, dailyLimit: null } };
const h = vi.hoisted(() => ({ auth: true, catalog: undefined as unknown, today: undefined as unknown }));
vi.mock("@/features/groups/ui/use-group-resource", () => ({
  GroupRequestError: class extends Error {},
  useGroupRequest: () => ({ request: () => Promise.resolve(h.catalog), authenticated: h.auth, ready: true, ownerKey: "u" }),
  useGroupResource: (url: string | null) => ({ data: url ? h.today : undefined, failure: undefined, loading: false, retry: vi.fn() }),
}));
import { DukjilProvider, resetDukjilCatalogCache } from "./dukjil-provider";
import { FanMissions } from "./fan-missions";

const action = (count: number, remaining: number | null) => ({ count, points: count, remaining, stamped: count > 0 });
const open = { post: action(1, 2), comment: action(0, 10), share: action(0, 3), reaction: action(5, 0), invite: action(0, null), quiz: action(0, null), proof: action(0, 2) };
const todayWith = (actions: Record<string, unknown>, attendedToday: boolean) => ({ kstDate: "2026-11-07", policyActive: true, totalPoints: 0, hasPassport: true, attendance: { attendedToday, streak: 1, nextBonusIn: 6 }, actions });
const certs = { certifications: [
  { id: "10000000-0000-4000-8000-000000000003", kind: "manual", category: "c", title: "종료된 인증", description: "", status: "closed", reward: null, actionHref: "/c/bias-x/certifications/3" },
  { id: "10000000-0000-4000-8000-000000000001", kind: "manual", category: "c", title: "구매 영수증 인증", description: "", status: "available", reward: null, actionHref: "/c/bias-x/certifications/1" },
  { id: "10000000-0000-4000-8000-000000000002", kind: "live_mission", category: "c", title: "LIVE", description: "", status: "available", reward: null, actionHref: "/live/x" },
] };
const ui = (slug = "bias-x") => render(<DukjilProvider slug={slug || undefined} accountToday={!slug} locale="ko"><FanMissions all locale="ko" slug={slug} title="오늘의 덕질" passportHref="/passports?locale=ko" proofHref={`/${slug}?tab=certifications&locale=ko`} noPage={slug ? undefined : "/pages/groups?locale=ko"} onAttendance={() => {}} /></DukjilProvider>);

beforeEach(() => {
  resetDukjilCatalogCache(); h.auth = true; h.catalog = { version: 1, rules, missionBook: {} }; h.today = todayWith(open, false);
  try { window.sessionStorage.clear(); } catch { /* none */ }
  vi.stubGlobal("fetch", vi.fn(async (url: string) => url.includes("/certifications") ? Response.json(certs) : Response.json({}, { status: 404 })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("lists today's rows (check-in and the daily-limit activities) first, then the other missions, with no fold heads", async () => {
  ui();
  // The 덕질 tab is one unfolded list: daily rows, then more missions. reaction is done (5/5) and keeps its catalog place.
  await screen.findByText("글쓰기");
  const list = document.querySelector("[data-fan-missions] [data-expanded]")!;
  expect([...list.querySelectorAll("li[data-mission]")].map(li => li.getAttribute("data-mission"))).toEqual(["checkin", "post", "comment", "reaction", "share", "invite", "quiz"]);
  expect(screen.queryByRole("button", { name: /그 밖의 덕질/ })).toBeNull();
  expect(screen.queryByRole("button", { name: /오늘 할 것/ })).toBeNull();
  expect(document.querySelector("[data-missions-left]")).toBeNull();
  expect(screen.getByRole("button", { name: "더 보기" })).toHaveAttribute("aria-expanded", "false");
});

it("shows S4 numbers in the F3 row: the reward and count use the shared fan activity row", async () => {
  ui();
  await waitFor(() => expect(document.querySelector('[data-mission="post"]')).toHaveTextContent("+20P"));
  const post = document.querySelector('[data-mission="post"]') as HTMLElement;
  expect(post).toHaveTextContent("+20P");
  expect(post).not.toHaveTextContent("×");
  expect(within(post).getByRole("progressbar", { name: "글쓰기" })).toHaveAttribute("aria-valuenow", "1");
  expect(post).toHaveTextContent("1/3");
  expect(post).not.toHaveTextContent("팬게시판에 글을 올려요");
  expect(post.querySelector("[data-mission-trailing]")).toHaveTextContent("+20P");
  expect(post.querySelector('[data-earn-badge="inline"] img')).toHaveAttribute("src", "/images/economy/point-coin.webp");
  expect(document.querySelector('[data-mission="reaction"] [data-mission-trailing]')).toHaveTextContent("완료");
  expect(document.querySelector('[data-mission="reaction"] [data-mission-stamp]')).not.toBeNull();
  expect(document.querySelector('[data-mission="invite"]')).not.toHaveTextContent("5명까지");
  expect(document.querySelector('[data-mission="invite"] [data-mission-trailing]')).toHaveTextContent("+200P");
  expect(document.querySelector('[data-mission="checkin"] [data-mission-trailing] [data-earn-badge="inline"]')).not.toBeNull();
  // No arrow anywhere in a row: the trailing column holds one thing.
  expect(document.querySelectorAll("[data-fan-missions] .lucide-arrow-right")).toHaveLength(0);
});

it("nudges the open reward badges on the first visit of a session only", async () => {
  const first = ui();
  await screen.findByText("글쓰기");
  await waitFor(() => expect(window.sessionStorage.getItem("dukjil-missions:nudged")).toBe("1"));
  expect(document.querySelector("[data-nudge]")).not.toBeNull();
  first.unmount();
  ui();
  await screen.findByText("글쓰기");
  expect(document.querySelector("[data-nudge]")).toBeNull();
});

it("keeps every done row in place with its done tag when all daily missions are finished", async () => {
  h.today = todayWith({ ...open, post: action(3, 0), comment: action(10, 0), share: action(3, 0) }, true);
  ui();
  await waitFor(() => expect(document.querySelectorAll("[data-fan-missions] li[data-done=true]")).toHaveLength(5));
  expect([...document.querySelectorAll("[data-fan-missions] li[data-mission]")].map(li => li.getAttribute("data-mission"))).toEqual(["checkin", "post", "comment", "reaction", "share", "invite", "quiz"]);
  expect(document.querySelector("[data-missions-left]")).toBeNull();
  expect(document.querySelector('[data-mission="post"] [data-mission-trailing]')).toHaveTextContent("완료");
});

it("lists the favorite's certifications as tiles to their own pages, open first, without LIVE missions", async () => {
  ui();
  const grid = await waitFor(() => { const el = document.querySelector('[data-certification-grid="items"]'); expect(el).not.toBeNull(); return el as HTMLElement; });
  const links = [...grid.querySelectorAll("a")];
  expect(links.map(link => link.getAttribute("href"))).toEqual(["/c/bias-x/certifications/1", "/c/bias-x/certifications/3"]);
  expect(links[0]).toHaveTextContent("참여 가능");
  expect(links[1]).toHaveTextContent("종료");
});

it("shows the six requested kinds to a guest without a page, each leading to the login", async () => {
  h.auth = false;
  ui("");
  const grid = await waitFor(() => { const el = document.querySelector('[data-certification-grid="kinds"]'); expect(el).not.toBeNull(); return el as HTMLElement; });
  const links = [...grid.querySelectorAll("a")];
  // 사용자 11/13 10:4x: each of the six shows the 인증 policy points (catalog rules.proof) as the mission rows' +NP badge.
  expect(links.map(link => link.textContent)).toEqual(["구매 영수증", "인스타 멤버십", "틱톡 멤버십", "유튜브 구독", "라이브 후원", "팬카페 가입"].map(name => `${name}+100P포인트 100 적립`));
  links.forEach(link => expect(link.getAttribute("href")).toMatch(/^\/login\?/));
});

it("D1: today's rows, more missions and certifications are all the one FanMissionRow", async () => {
  ui();
  await waitFor(() => expect(document.querySelector('[data-certification-grid="items"]')).not.toBeNull());
  const items = [...document.querySelectorAll("[data-fan-missions] li")].filter(li => !li.hasAttribute("aria-busy"));
  expect(items.length).toBeGreaterThan(5);
  for (const li of items) expect(li.querySelector("a[data-fan-mission-row]"), li.textContent ?? "").not.toBeNull();
  // The fold heads are gone: no row is a button.
  expect(document.querySelectorAll('button[data-fan-mission-row="fold"]')).toHaveLength(0);
});

it("the more button expands the unfolded list and daily actions use the fan activity stamp art", async () => {
  ui();
  await screen.findByText("글쓰기");
  const list = document.querySelector("[data-fan-missions] [data-expanded]")!;
  expect(list.querySelectorAll("li[data-mission] [data-mission-art] > img")).toHaveLength(7);
  const more = screen.getByRole("button", { name: "더 보기" });
  fireEvent.click(more);
  expect(list).toHaveAttribute("data-expanded", "true");
  expect(screen.getByRole("button", { name: "접기" })).toHaveAttribute("aria-expanded", "true");
  fireEvent.click(screen.getByRole("button", { name: "접기" }));
  expect(list).toHaveAttribute("data-expanded", "false");
});

it("guests get the rows without a left-today count", async () => {
  h.auth = false; ui();
  await screen.findByText("글쓰기");
  expect(document.querySelector("[data-missions-left]")).toBeNull();
  expect(document.querySelectorAll("[data-fan-missions] li[data-mission]").length).toBeGreaterThan(0);
});
