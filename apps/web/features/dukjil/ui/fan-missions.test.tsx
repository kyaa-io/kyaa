import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const rules = { checkin: { points: 2, streakBonus: 10, streakEvery: 7 }, post: { points: 20, dailyLimit: 3 }, comment: { points: 3, dailyLimit: 10 }, reaction: { points: 1, dailyLimit: 10 }, share: { points: 10, dailyLimit: 3 }, invite: { points: 200, dailyLimit: null }, proof: { points: 100, dailyLimit: null } };
const h = vi.hoisted(() => ({ auth: true, ready: true, catalog: undefined as unknown, today: undefined as unknown, failure: undefined as unknown, urls: [] as (string | null)[], byUrl: {} as Record<string, unknown> }));
vi.mock("@/features/groups/ui/use-group-resource", () => ({
  GroupRequestError: class extends Error {},
  useGroupRequest: () => ({ request: () => Promise.resolve(h.catalog), authenticated: h.auth, ready: h.ready, ownerKey: "u" }),
  useGroupResource: (url: string | null) => { h.urls.push(url); const own = url ? Object.entries(h.byUrl).find(([prefix]) => url.startsWith(prefix))?.[1] : undefined; return { data: url ? own ?? h.today : undefined, failure: h.failure, loading: false, retry: vi.fn() }; },
}));
import { DukjilProvider, resetDukjilCatalogCache } from "./dukjil-provider";
import { FanMissions } from "./fan-missions";

const action = (count: number, remaining: number | null, stamped = false) => ({ count, points: count, remaining, stamped });
const today = { kstDate: "2026-11-07", policyActive: true, totalPoints: 22, hasPassport: true, attendance: { attendedToday: true, streak: 3, nextBonusIn: 4 }, actions: { post: action(1, 2, true), comment: action(0, 10), reaction: action(2, 8), share: action(3, 0, true), invite: action(0, null), proof: action(0, 2) } };
const onAttendance = vi.fn();
const ui = (all = false) => render(<DukjilProvider slug="elina" locale="ko"><FanMissions locale="ko" slug="elina" title="팬 활동" all={all} passportHref="/passports/p?locale=ko" proofHref="/elina?tab=certifications&locale=ko" onAttendance={onAttendance} /></DukjilProvider>);

beforeEach(() => { resetDukjilCatalogCache(); h.auth = true; h.ready = true; h.catalog = { version: 1, rules, missionBook: {} }; h.today = today; h.failure = undefined; h.urls = []; h.byUrl = {}; onAttendance.mockReset(); });
afterEach(cleanup);
const rowNow = (key: string) => document.querySelector<HTMLElement>(`li[data-mission="${key}"]`)!;
const row = (key: string) => waitFor(() => { const el = rowNow(key); if (!el) throw new Error(key); return el; });

it("shows today's points as the coin badge, with no stamp icon box beside it (C8)", async () => {
  const { container } = ui();
  expect(await screen.findByText("오늘 +22P")).toBeInTheDocument();
  const head = container.querySelector("[data-fan-missions] h2")!.parentElement!;
  expect(head.querySelector("svg.lucide-stamp")).toBeNull();
  expect(head).not.toHaveTextContent(/스탬프/);
});
it("shows each mission's reward as one amount with no ×N count, and its progress as a bar with count/limit (C8)", async () => {
  const { container } = ui();
  await row("post");
  expect(container.textContent).not.toMatch(/×\s*\d/);
});
it("draws progress against the daily limit, shows no task sentence, and no bar without a limit", async () => {
  ui();
  const post = (await row("post"));
  expect(post.querySelector("[role=progressbar]")).toHaveAttribute("aria-valuenow", "1");
  expect(post.querySelector("[role=progressbar]")).toHaveAttribute("aria-valuemax", "3");
  expect(post).toHaveTextContent("1/3");
  expect(post).not.toHaveTextContent("팬게시판에 글을 올려요");
  expect(post).toHaveTextContent("+20P");
  // S4: 배지에는 금액만. 남은 횟수는 게이지(1/3)가 말한다.
  expect(post).not.toHaveTextContent("×");
  expect(rowNow("invite").querySelector("[role=progressbar]")).toBeNull();
  // A monthly cap also reports `remaining`, but that is not today's limit.
  expect(rowNow("proof").querySelector("[role=progressbar]")).toBeNull();
});
it("marks a finished activity and sends it after the open ones", async () => {
  ui();
  const rows = await screen.findAllByRole("listitem");
  await waitFor(() => expect(rowNow("share")).toHaveAttribute("data-done", "true"));
  const keys = screen.getAllByRole("listitem").map(row => row.getAttribute("data-mission"));
  expect(rows.length).toBe(7);
  expect(keys.indexOf("share")).toBeGreaterThan(keys.indexOf("post"));
  expect(rowNow("share")).toHaveTextContent("완료");
});
it("goes to the screen of each activity and opens the dialog for check-in", async () => {
  ui();
  expect((await row("post")).querySelector("a")).toHaveAttribute("href", "/elina?tab=board&source=fans&compose=1&locale=ko");
  expect(rowNow("comment").querySelector("a")).toHaveAttribute("href", "/elina?tab=board&source=fans&locale=ko");
  expect(rowNow("share").querySelector("a")).toHaveAttribute("href", "/elina?tab=certifications&share=1&locale=ko");
  expect(rowNow("invite").querySelector("a")).toHaveAttribute("href", "/my/invitations?locale=ko");
  expect(rowNow("proof").querySelector("a")).toHaveAttribute("href", "/elina?tab=certifications&locale=ko");
  fireEvent.click(rowNow("checkin").querySelector("a")!);
  expect(onAttendance).toHaveBeenCalledTimes(1);
});
it("keeps the cards for a guest with public points, no personal values, and a login on press", async () => {
  h.auth = false;
  ui();
  const post = (await row("post"));
  await waitFor(() => expect(post).toHaveTextContent("+20P"));
  expect(post).not.toHaveTextContent("×");
  expect(post.querySelector("[role=progressbar]")).toBeNull();
  expect(post.querySelector("a")!.getAttribute("href")).toContain("/login");
  expect(screen.getByRole("img", { name: "로그인 후 확인" })).toBeInTheDocument();
  expect(screen.queryByText("완료")).toBeNull();
  expect(h.urls.filter(url => url?.startsWith("/api/me/"))).toEqual([]);
});
it("shows the activities without numbers when the policy is off", async () => {
  h.catalog = { version: null, rules: {}, missionBook: null };
  ui();
  await waitFor(() => expect(screen.getAllByRole("listitem").length).toBe(3));
  expect(document.body.textContent).not.toMatch(/\+\d+P/);
  expect(screen.queryByRole("group")).toBeNull();
});
it("offers a retry when today fails", async () => {
  h.today = undefined;
  h.failure = new Error("x");
  ui();
  expect(await screen.findByText("출석 정보를 불러오지 못했어요")).toBeInTheDocument();
});

it("M4-3: counts a check-in on any joined page today, not only the favorite's own page", async () => {
  h.today = { ...today, attendance: { attendedToday: false, streak: 0, nextBonusIn: 7 } };
  h.byUrl = { "/api/groups?mine=joined": { items: [{ celebrityId: "c-elina", slug: "elina" }, { celebrityId: "c-other", slug: "other" }] },
    "/api/me/attendance?creators=": { items: [{ celebrityId: "c-elina", attendedToday: false }, { celebrityId: "c-other", attendedToday: true }] } };
  ui();
  await waitFor(() => expect(rowNow("checkin")).toHaveAttribute("data-done", "true"));
  expect(rowNow("checkin")).toHaveTextContent("1/1");
  expect(h.urls).toContain("/api/me/attendance?creators=elina,other");
});
it("M4-3: stays 0/1 when no joined page was checked in today", async () => {
  h.today = { ...today, attendance: { attendedToday: false, streak: 0, nextBonusIn: 7 } };
  h.byUrl = { "/api/groups?mine=joined": { items: [{ celebrityId: "c-elina", slug: "elina" }] }, "/api/me/attendance?creators=": { items: [{ celebrityId: "c-elina", attendedToday: false }] } };
  ui();
  await waitFor(() => expect(rowNow("checkin")).toHaveTextContent("0/1"));
  expect(rowNow("checkin")).toHaveAttribute("data-done", "false");
});

it.each([false,true])('shows supported reaction once with shared progress and reward (all=%s)',async all=>{
 const view=ui(all);
 await row('reaction');
 await waitFor(()=>expect(rowNow('reaction')).toHaveTextContent('2/10'));
 const reaction=rowNow('reaction');
 expect(reaction).toHaveTextContent('+1P');
 expect(reaction.querySelector('[role=progressbar]')).toHaveAttribute('aria-valuenow','2');
 expect(reaction.querySelector('a')).toHaveAttribute('href','/elina?tab=board&source=fans&locale=ko');
 expect(view.container.querySelectorAll('[data-mission="reaction"]')).toHaveLength(1);
});
it('omits reaction when the catalog does not support it',async()=>{
 const {reaction,...supported}=rules;h.catalog={version:1,rules:supported,missionBook:{}};
 ui();await row('post');await waitFor(()=>expect(rowNow('reaction')).toBeNull());
});
