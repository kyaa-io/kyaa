import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const rules = { checkin: { points: 2, streakBonus: 10, streakEvery: 7 }, post: { points: 20, dailyLimit: 3 }, comment: { points: 3, dailyLimit: 10 }, share: { points: 10, dailyLimit: 3 }, invite: { points: 200, dailyLimit: null }, proof: { points: 100, dailyLimit: null } };
const h = vi.hoisted(() => ({ auth: true, ready: true, catalog: undefined as unknown, today: undefined as unknown, failure: undefined as unknown, urls: [] as (string | null)[] }));
vi.mock("@/features/groups/ui/use-group-resource", () => ({
  GroupRequestError: class extends Error {},
  useGroupRequest: () => ({ request: () => Promise.resolve(h.catalog), authenticated: h.auth, ready: h.ready, ownerKey: "u" }),
  useGroupResource: (url: string | null) => { h.urls.push(url); return { data: url ? h.today : undefined, failure: h.failure, loading: false, retry: vi.fn() }; },
}));
import { DukjilProvider, resetDukjilCatalogCache } from "./dukjil-provider";
import { FanMissions } from "./fan-missions";

const action = (count: number, remaining: number | null, stamped = false) => ({ count, points: count, remaining, stamped });
const today = { kstDate: "2026-11-07", policyActive: true, totalPoints: 22, hasPassport: true, attendance: { attendedToday: true, streak: 3, nextBonusIn: 4 }, actions: { post: action(1, 2, true), comment: action(0, 10), share: action(3, 0, true), invite: action(0, null), proof: action(0, 2) } };
const onAttendance = vi.fn();
const ui = () => render(<DukjilProvider slug="elina" locale="ko"><FanMissions locale="ko" slug="elina" title="팬 활동" passportHref="/passports/p?locale=ko" proofHref="/elina?tab=certifications&locale=ko" onAttendance={onAttendance} /></DukjilProvider>);

beforeEach(() => { resetDukjilCatalogCache(); h.auth = true; h.ready = true; h.catalog = { version: 1, rules, missionBook: {} }; h.today = today; h.failure = undefined; h.urls = []; onAttendance.mockReset(); });
afterEach(cleanup);

it("shows today's points as the coin badge and the stamp count, from the today read", async () => {
  ui();
  expect(await screen.findByRole("group", { name: "오늘 받은 포인트 22P · 도장 2개" })).toHaveTextContent("오늘 +22P");
  expect(screen.getByRole("group", { name: /도장 2개/ })).toHaveTextContent(/2$/);
});
it("draws progress against the daily limit, says what to do, and no bar without a limit", async () => {
  ui();
  const post = (await screen.findByText("팬게시판에 글을 올려요")).closest("li")!;
  expect(post.querySelector("[role=progressbar]")).toHaveAttribute("aria-valuenow", "1");
  expect(post.querySelector("[role=progressbar]")).toHaveAttribute("aria-valuemax", "3");
  expect(post).toHaveTextContent("1/3");
  expect(post).toHaveTextContent("+20P");
  expect(post).toHaveTextContent("×2");
  expect(screen.getByText("초대 링크로 친구를 데려와요").closest("li")!.querySelector("[role=progressbar]")).toBeNull();
  // A monthly cap also reports `remaining`, but that is not today's limit.
  expect(screen.getByText("조건을 확인하고 인증을 제출해요").closest("li")!.querySelector("[role=progressbar]")).toBeNull();
});
it("marks a finished activity and sends it after the open ones", async () => {
  ui();
  const rows = await screen.findAllByRole("listitem");
  await waitFor(() => expect(screen.getByText("친구가 내 패스포트 링크를 열면 쌓여요").closest("li")).toHaveAttribute("data-done", "true"));
  const keys = screen.getAllByRole("listitem").map(row => row.getAttribute("data-mission"));
  expect(rows.length).toBe(6);
  expect(keys.indexOf("share")).toBeGreaterThan(keys.indexOf("post"));
  expect(screen.getByText("친구가 내 패스포트 링크를 열면 쌓여요").closest("li")).toHaveTextContent("완료");
});
it("goes to the screen of each activity and opens the dialog for check-in", async () => {
  ui();
  expect((await screen.findByText("팬게시판에 글을 올려요")).closest("a")).toHaveAttribute("href", "/elina?tab=board&source=fans&compose=1&locale=ko");
  expect(screen.getByText("팬게시판 글에 댓글을 달아요").closest("a")).toHaveAttribute("href", "/elina?tab=board&source=fans&locale=ko");
  expect(screen.getByText("친구가 내 패스포트 링크를 열면 쌓여요").closest("a")).toHaveAttribute("href", "/passports/p?locale=ko#stamp-book");
  expect(screen.getByText("초대 링크로 친구를 데려와요").closest("a")).toHaveAttribute("href", "/my/invitations?locale=ko");
  expect(screen.getByText("조건을 확인하고 인증을 제출해요").closest("a")).toHaveAttribute("href", "/elina?tab=certifications&locale=ko");
  fireEvent.click(screen.getByText("오늘 출석해요"));
  expect(onAttendance).toHaveBeenCalledTimes(1);
});
it("keeps the cards for a guest with public points, no personal values, and a login on press", async () => {
  h.auth = false;
  ui();
  const post = (await screen.findByText("팬게시판에 글을 올려요")).closest("li")!;
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
