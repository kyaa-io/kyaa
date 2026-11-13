import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const page = (slug: string, celebrityId: string) => ({ id: `p-${slug}`, kind: "fan", celebrityId, slug, name: slug.toUpperCase(), description: "d", imageUrl: null, question: null, memberCount: 1 });
const h = vi.hoisted(() => ({ urls: [] as string[], list: undefined as unknown, status: undefined as unknown, posts: [] as string[], request: undefined as unknown as (path: string, init?: { method?: string }) => Promise<unknown> }));
vi.mock("@/features/groups/ui/use-group-resource", () => ({
  GroupRequestError: class extends Error {},
  useGroupRequest: () => ({ request: h.request, authenticated: true, ready: true, ownerKey: "u" }),
  useGroupResource: (url: string | null) => {
    if (url) h.urls.push(url);
    const data = !url ? undefined : url.includes("/api/me/dukjil/today") ? { kstDate: "2026-11-05", policyActive: true, totalPoints: 0, actions: {}, attendance: { attendedToday: false, streak: 0, nextBonusIn: 7 }, hasPassport: true } : url.includes("/api/me/attendance") ? h.status : h.list;
    return { data, loading: false, error: false, retry: vi.fn() };
  },
}));
vi.mock("@/components/ui/overlay/accessible-overlay", () => ({ Dialog: ({ open, labelledBy, children }: { open: boolean; labelledBy: string; children: React.ReactNode }) => open ? <div role="dialog" aria-labelledby={labelledBy}>{children}</div> : null }));
vi.mock("@/features/groups/domain/contracts", async importOriginal => ({ ...(await importOriginal<object>()), groupListSchema: { parse: (v: unknown) => v } }));
import { MyAttendanceList } from "./my-attendance-list";

beforeEach(() => {
  h.urls = [];
  h.posts = [];
  h.request = async (path, init) => {
    if (init?.method === "POST") { h.posts.push(path); return { points: 10, streak: 1, bonusPoints: 0, stampId: null, attendanceDate: "2026-11-05", replayed: false }; }
    return { version: 1, rules: { checkin: { points: 10 } }, missionBook: null };
  };
  h.list = { items: [page("aespa", "11111111-1111-4111-8111-111111111111"), page("ive", "22222222-2222-4222-8222-222222222222")], nextCursor: null };
  h.status = { kstDate: "2026-11-05", items: [
    { celebrityId: "11111111-1111-4111-8111-111111111111", attendedToday: true, streak: 3, nextBonusIn: 4, hasPassport: true },
    { celebrityId: "22222222-2222-4222-8222-222222222222", attendedToday: false, streak: 0, nextBonusIn: 7, hasPassport: false },
  ] };
});

it("reads every row's state with one attendance request and no per-row provider", () => {
  render(<MyAttendanceList locale="ko" />);
  expect(new Set(h.urls.filter(url => url.includes("/api/me/attendance")))).toEqual(new Set(["/api/me/attendance?creators=aespa,ive"]));
  expect(screen.getAllByRole("listitem")).toHaveLength(2);
  expect(screen.getAllByRole("link").length).toBe(1);
});

it("modal form: round avatars named by the page, a green ring and no button once checked in, 연속 N일 under the avatar", () => {
  render(<MyAttendanceList locale="ko" />);
  const done = screen.getByRole("img", { name: "AESPA" });
  expect(done.getAttribute("data-attended")).toBe("true");
  expect(screen.getByRole("img", { name: "IVE" }).getAttribute("data-attended")).toBe("false");
  const item = done.closest("li")!;
  expect(item.textContent).toContain("연속 3일");
  expect(item.querySelector("small [data-number-role]")?.textContent).toBe("3");
  expect(item.querySelector('small [data-fan-activity-stamp="streak"]')).not.toBeNull();
  expect(item.textContent).toContain("오늘 완료");
  expect(within(item).getByRole("button", {name: "오늘 완료"})).toBeDisabled();
  expect(within(item).getByText("AESPA")).toBeInTheDocument();
  expect(within(item).queryByRole("link")).toBeNull();
});

it("modal form: only a page still open today has the check-in button", () => {
  const pages = [page("aespa", "11111111-1111-4111-8111-111111111111"), page("nmixx", "33333333-3333-4333-8333-333333333333")];
  h.list = { items: pages, nextCursor: null };
  h.status = { kstDate: "2026-11-05", items: [
    { celebrityId: pages[0].celebrityId, attendedToday: true, streak: 3, nextBonusIn: 4, hasPassport: true },
    { celebrityId: pages[1].celebrityId, attendedToday: false, streak: 0, nextBonusIn: 7, hasPassport: true },
  ] };
  render(<MyAttendanceList locale="ko" />);
  expect(screen.getAllByRole("button", { name: "출석하기" })).toHaveLength(1);
  expect(screen.getByRole("img", { name: "NMIXX" }).closest("li")).toBe(screen.getByRole("button", { name: "출석하기" }).closest("li"));
});

it("section form: heading, pending pages first, five-row limit with an expand control, and a retry label that is not 출석하기", () => {
  const many = Array.from({ length: 7 }, (_, i) => page(`p${i}`, `00000000-0000-4000-8000-00000000000${i}`));
  h.list = { items: many, nextCursor: null };
  h.status = { kstDate: "2026-11-05", items: many.map((p, i) => ({ celebrityId: p.celebrityId, attendedToday: i === 0, streak: i === 0 ? 3 : 0, nextBonusIn: 4, hasPassport: true })) };
  render(<MyAttendanceList locale="ko" section={{ title: "오늘의 덕질", moreLabel: "전체 보기", lessLabel: "접기", limit: 5 }} />);
  expect(screen.getByRole("heading", { name: "오늘의 덕질" })).toBeTruthy();
  const rows = screen.getAllByRole("listitem");
  expect(rows).toHaveLength(5);
  expect(rows[0].textContent).toContain("P1");
  expect(screen.queryByText("P0")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "전체 보기" }));
  expect(screen.getAllByRole("listitem")).toHaveLength(7);
  expect(screen.queryByRole("button", { name: "전체 보기" })).toBeNull();
});

it("opens the dialog for the pressed row only: its title names that page and the request goes to that creator", async () => {
  const pages = [page("aespa", "11111111-1111-4111-8111-111111111111"), page("ive", "22222222-2222-4222-8222-222222222222"), page("nmixx", "33333333-3333-4333-8333-333333333333")];
  h.list = { items: pages, nextCursor: null };
  h.status = { kstDate: "2026-11-05", items: pages.map(p => ({ celebrityId: p.celebrityId, attendedToday: false, streak: 0, nextBonusIn: 7, hasPassport: true })) };
  render(<MyAttendanceList locale="ko" section={{ title: "오늘의 덕질", moreLabel: "전체 보기", lessLabel: "접기", limit: 5 }} />);
  const buttons = screen.getAllByRole("button", { name: "출석하기" });
  expect(buttons).toHaveLength(3);
  fireEvent.click(buttons[1]);
  const dialog = await screen.findByRole("dialog");
  expect(dialog.querySelector("h2")?.textContent).toBe("IVE 출석체크");
  expect(dialog.textContent).not.toContain("엔카이브");
  fireEvent.click(within(dialog).getAllByRole("button").find(button => /10P/.test(button.textContent ?? ""))!);
  await waitFor(() => expect(h.posts).toEqual(["/api/me/attendance/ive"]));
});

it("emphasises only the first check-in, and only when asked to; review and finished rows are never emphasised", () => {
  const pages = [page("aespa", "11111111-1111-4111-8111-111111111111"), page("ive", "22222222-2222-4222-8222-222222222222"), page("nmixx", "33333333-3333-4333-8333-333333333333")];
  h.list = { items: pages, nextCursor: null };
  h.status = { kstDate: "2026-11-05", items: [
    { celebrityId: pages[0].celebrityId, attendedToday: true, streak: 3, nextBonusIn: 4, hasPassport: true },
    { celebrityId: pages[1].celebrityId, attendedToday: false, streak: 0, nextBonusIn: 7, hasPassport: false },
    { celebrityId: pages[2].celebrityId, attendedToday: false, streak: 0, nextBonusIn: 7, hasPassport: true },
  ] };
  const section = { title: "오늘의 덕질", moreLabel: "전체 보기", lessLabel: "접기", limit: 5 };
  const plain = render(<MyAttendanceList locale="ko" section={section} />);
  expect(plain.container.querySelectorAll("[class*=primary]")).toHaveLength(0);
  plain.unmount();
  const loud = render(<MyAttendanceList locale="ko" section={{ ...section, emphasise: true }} />);
  const primary = [...loud.container.querySelectorAll("[class*=primary]")];
  expect(primary.map(el => el.textContent)).toEqual(["출석하기"]);
  expect(primary[0].closest("li")?.textContent).toContain("NMIXX");
});

it("section form orders pages with a check-in button first, then entry reviews, then finished pages", () => {
  const pages = [page("done", "11111111-1111-4111-8111-111111111111"), page("review", "22222222-2222-4222-8222-222222222222"), page("open", "33333333-3333-4333-8333-333333333333")];
  h.list = { items: pages, nextCursor: null };
  h.status = { kstDate: "2026-11-05", items: [
    { celebrityId: pages[0].celebrityId, attendedToday: true, streak: 3, nextBonusIn: 4, hasPassport: true },
    { celebrityId: pages[1].celebrityId, attendedToday: false, streak: 0, nextBonusIn: 7, hasPassport: false },
    { celebrityId: pages[2].celebrityId, attendedToday: false, streak: 0, nextBonusIn: 7, hasPassport: true },
  ] };
  render(<MyAttendanceList locale="ko" section={{ title: "오늘의 덕질", moreLabel: "전체 보기", lessLabel: "접기", limit: 5 }} />);
  expect(screen.getAllByRole("listitem").map(row => row.textContent?.match(/DONE|REVIEW|OPEN/)?.[0])).toEqual(["OPEN", "REVIEW", "DONE"]);
});

it("sends a joined page without a passport straight to its entry review", () => {
  render(<MyAttendanceList locale="ko" />);
  const link = screen.getByRole("link", { name: "입국 심사" });
  expect(link.getAttribute("href")).toBe("/c/ive/verify?locale=ko");
});

it("modal rows keep avatar, visible name and action together", () => {
  (h.status as { items: { hasPassport: boolean }[] }).items[1].hasPassport = true;
  render(<MyAttendanceList locale="ko" />);
  const row = screen.getByRole("img", {name:"IVE"}).closest("li")!;
  expect(within(row).getByText("IVE")).toBeInTheDocument();
  expect(within(row).getByRole("button", {name:"출석하기"})).toBeEnabled();
});
