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
const ui = (slug = "bias-x") => render(<DukjilProvider slug={slug || undefined} accountToday={!slug} locale="ko"><FanMissions all locale="ko" slug={slug} title="오늘의 미션" passportHref="/passports?locale=ko" proofHref={`/${slug}?tab=certifications&locale=ko`} noPage={slug ? undefined : "/pages/groups?locale=ko"} onAttendance={() => {}} /></DukjilProvider>);

beforeEach(() => {
  resetDukjilCatalogCache(); h.auth = true; h.catalog = { version: 1, rules, missionBook: {} }; h.today = todayWith(open, false);
  try { window.sessionStorage.clear(); } catch { /* none */ }
  vi.stubGlobal("fetch", vi.fn(async (url: string) => url.includes("/certifications") ? Response.json(certs) : Response.json({}, { status: 404 })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("opens only today's fold, with check-in and the daily-limit activities, and leaves the rest closed", async () => {
  ui();
  const today = await screen.findByRole("button", { name: /오늘 할 것/ });
  expect(today).toHaveAttribute("aria-expanded", "true");
  // reaction is done (5/5): 출석·글쓰기·댓글·공유 are left.
  expect(today).toHaveTextContent("4개 남음");
  const panel = document.getElementById(today.getAttribute("aria-controls")!)!;
  expect([...panel.querySelectorAll("li[data-mission]")].map(li => li.getAttribute("data-mission"))).toEqual(["checkin", "post", "comment", "share", "reaction"]);
  expect(screen.getByRole("button", { name: /그 밖의 미션/ })).toHaveAttribute("aria-expanded", "false");
  expect(screen.getByRole("button", { name: /그 밖의 미션/ })).toHaveTextContent("+220P");
  expect(screen.getByRole("button", { name: /인증/ })).toHaveAttribute("aria-expanded", "false");
  const more = document.getElementById(screen.getByRole("button", { name: /그 밖의 미션/ }).getAttribute("aria-controls")!)!;
  expect([...more.querySelectorAll("li[data-mission]")].map(li => li.getAttribute("data-mission"))).toEqual(["invite", "quiz"]);
});

it("shows S4 numbers: the badge is the amount only, the gauge says the count, invite says its cap, check-in has its action", async () => {
  ui();
  await screen.findByRole("button", { name: /오늘 할 것/ });
  const post = (await screen.findByText("글쓰기")).closest("li")!;
  expect(post).toHaveTextContent("+20P");
  expect(post).not.toHaveTextContent("×");
  expect(within(post).getByRole("progressbar", { name: "글쓰기" })).toHaveAttribute("aria-valuenow", "1");
  expect(post).toHaveTextContent("1/3");
  expect(post).not.toHaveTextContent("팬게시판에 글을 올려요");
  expect(document.querySelector('[data-mission="invite"]')).toHaveTextContent("5명까지");
  expect(document.querySelector('[data-mission="checkin"]')).toHaveTextContent("출석하기");
});

it("nudges the open reward badges on the first visit of a session only", async () => {
  const first = ui();
  await screen.findByRole("button", { name: /오늘 할 것/ });
  await waitFor(() => expect(window.sessionStorage.getItem("dukjil-missions:nudged")).toBe("1"));
  expect(document.querySelector("[data-nudge]")).not.toBeNull();
  first.unmount();
  ui();
  await screen.findByRole("button", { name: /오늘 할 것/ });
  expect(document.querySelector("[data-nudge]")).toBeNull();
});

it("closes today's fold and says so when everything daily is done", async () => {
  h.today = todayWith({ ...open, post: action(3, 0), comment: action(10, 0), share: action(3, 0) }, true);
  ui();
  const today = await screen.findByRole("button", { name: /오늘 할 것/ });
  await waitFor(() => expect(today).toHaveTextContent("모두 완료"));
  expect(screen.getByRole("button", { name: /오늘 할 것/ })).toHaveAttribute("aria-expanded", "false");
});

it("lists the favorite's certifications as tiles to their own pages, open first, without LIVE missions", async () => {
  ui();
  const fold = await screen.findByRole("button", { name: /인증/ });
  expect(fold).toHaveTextContent("+100P");
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
  expect(links.map(link => link.textContent)).toEqual(["구매 영수증", "인스타 멤버십", "틱톡 멤버십", "유튜브 구독", "라이브 후원", "팬카페 가입"]);
  links.forEach(link => expect(link.getAttribute("href")).toMatch(/^\/login\?/));
});

it("D1: today's rows, more missions and certifications are all the one FanMissionRow", async () => {
  ui();
  for (const name of [/그 밖의 미션/, /인증/]) fireEvent.click(await screen.findByRole("button", { name }));
  await waitFor(() => expect(document.querySelector('[data-certification-grid="items"]')).not.toBeNull());
  const items = [...document.querySelectorAll("[data-fan-missions] li")].filter(li => !li.hasAttribute("aria-busy"));
  expect(items.length).toBeGreaterThan(5);
  for (const li of items) expect(li.querySelector("a[data-fan-mission-row]"), li.textContent ?? "").not.toBeNull();
});
