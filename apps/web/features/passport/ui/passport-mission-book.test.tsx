// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ status: "on" as "on" | "off" | "loading", resource: {} as Record<string, unknown>, request: vi.fn() }));
vi.mock("@/features/dukjil/ui/dukjil-provider", () => ({ useDukjil: () => ({ status: state.status }) }));
vi.mock("@/features/groups/ui/use-group-resource", () => ({
  GroupRequestError: class extends Error { status: number; constructor(status: number) { super("x"); this.status = status; } },
  useGroupResource: (url: string | null) => (url ? state.resource : { loading: false, error: false, data: undefined, retry: vi.fn() }),
  useGroupRequest: () => ({ request: state.request }),
}));

import { PassportMissionBook, StackedStampPages, SLOT, missionHref } from "./passport-mission-book";

const KINDS = ["quiz", "checkin", "post", "comment", "share", "invite", "subscription", "steady_checkin", "proof"];
const slots = (filled: number) => KINDS.map((kind, i) => ({ slotNo: i + 1, kind, state: i < filled ? "filled" : "empty", stampId: i < filled ? "00000000-0000-4000-8000-00000000000" + (i + 1) : null, clearedAt: i < filled ? "2026-11-06T00:00:00Z" : null }));
const page = (over: Record<string, unknown>) => ({ pageNo: 1, slots: slots(9), filled: 9, claimable: true, claimed: false, locked: false, lockedReason: null, ...over });
const data = (pages: unknown[], hearts = 0) => ({ passportId: "00000000-0000-4000-8000-000000000001", celebrityId: "00000000-0000-4000-8000-000000000002", hearts, pages });
const ui = (locale: "ko" | "en" | "ru" = "ko") => render(<PassportMissionBook passportId="p1" creatorSlug="c1" locale={locale} />);

beforeEach(() => { localStorage.setItem("kyaa:passport:mission-onboarding:v1", "1"); state.status = "on"; state.request = vi.fn().mockResolvedValue({ hearts: 1, pageNo: 1, jjinfanConfirmed: false, cheerStampId: null, replayed: false }); });
afterEach(cleanup);

describe("PassportMissionBook", () => {
  it("DS-D 9/9: arriving with #mission-book moves to the claim button once the pages are drawn and focuses it", () => {
    const scroll = vi.fn(); const original = Element.prototype.scrollIntoView; Element.prototype.scrollIntoView = scroll;
    window.history.replaceState(null, "", "/passports/p1?locale=ko#mission-book");
    try {
      state.resource = { loading: true, error: false, data: undefined, retry: vi.fn() };
      const view = ui();
      expect(scroll).not.toHaveBeenCalled();
      state.resource = { loading: false, error: false, data: data([page({})]), retry: vi.fn() };
      view.rerender(<PassportMissionBook passportId="p1" creatorSlug="c1" locale="ko" />);
      const claim = screen.getByRole("button", { name: "하트 받기" });
      expect(document.activeElement).toBe(claim);
      expect(scroll).toHaveBeenCalledTimes(1);
      view.rerender(<PassportMissionBook passportId="p1" creatorSlug="c1" locale="ko" />);
      expect(scroll).toHaveBeenCalledTimes(1);
    } finally { Element.prototype.scrollIntoView = original; window.history.replaceState(null, "", "/"); }
  });
  it("DS-D 9/9: with nothing to claim the hash lands on the book title, and without the hash nothing moves", () => {
    const scroll = vi.fn(); const original = Element.prototype.scrollIntoView; Element.prototype.scrollIntoView = scroll;
    try {
      state.resource = { loading: false, error: false, data: data([page({ claimable: false, claimed: true })]), retry: vi.fn() };
      ui(); expect(scroll).not.toHaveBeenCalled(); cleanup();
      window.history.replaceState(null, "", "/passports/p1?locale=ko#mission-book");
      ui(); expect(document.activeElement).toBe(document.getElementById("mission-book-title")); expect(scroll).toHaveBeenCalledTimes(1);
    } finally { Element.prototype.scrollIntoView = original; window.history.replaceState(null, "", "/"); }
  });
  it("renders nothing while the policy is off or undecided", () => {
    state.resource = { loading: false, error: false, data: data([page({})]), retry: vi.fn() };
    state.status = "off"; expect(ui().container.innerHTML).toBe("");
    cleanup(); state.status = "loading"; expect(ui().container.innerHTML).toBe("");
  });
  it("shows nine slots and claims a complete first page", async () => {
    const retry = vi.fn();
    state.resource = { loading: false, error: false, data: data([page({})]), retry };
    ui();
    expect(screen.getAllByRole("listitem")).toHaveLength(9);
    fireEvent.click(screen.getByRole("button", { name: "하트 받기" }));
    await waitFor(() => expect(retry).toHaveBeenCalled());
    expect(state.request.mock.calls[0][0]).toBe("/api/me/passports/p1/pages/1/claim");
  });
  it("names the check-in slot from the policy action instead of its slot number", () => {
    state.resource = { loading: false, error: false, data: data([page({ slots: slots(2), filled: 2, claimable: false })]), retry: vi.fn() };
    ui();
    expect(screen.getByRole("checkbox", { name: "출석" })).toBeTruthy();
    expect(screen.queryByText("2")).toBeNull();
  });
  it("exposes each slot's state and marks a filled page 2 slot that has no art", () => {
    const overflow = KINDS.map((_, i) => ({ slotNo: i + 1, kind: null, state: i < 3 ? "filled" : "empty", stampId: i < 3 ? "00000000-0000-4000-8000-00000000000" + (i + 1) : null, clearedAt: null }));
    state.resource = { loading: false, error: false, data: data([page({ slots: slots(4), filled: 4, claimable: false }), page({ pageNo: 2, slots: overflow, filled: 3, claimable: false, locked: true, lockedReason: "jjinfan_required" })]), retry: vi.fn() };
    const { container } = ui();
    const states = screen.getAllByRole("checkbox").map(el => el.getAttribute("aria-checked"));
    expect(states.filter(value => value === "true")).toHaveLength(4);
    expect(states.filter(value => value === "false")).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "다음 쪽" }));
    const next = screen.getAllByRole("checkbox").map(el => el.getAttribute("aria-checked"));
    expect(next.filter(value => value === "true")).toHaveLength(3);
    expect(next.filter(value => value === "false")).toHaveLength(6);
    expect(screen.getAllByRole("checkbox").every(el => el.getAttribute("aria-disabled") === "true" && !el.hasAttribute("tabindex"))).toBe(true);
    expect(container.querySelectorAll("[data-state='filled']:not([data-kind]) svg")).toHaveLength(3);
    expect(container.querySelectorAll("[data-state='empty']:not([data-kind]) svg")).toHaveLength(0);
  });
  it("explains a disabled claim with what is missing and leaves an open claim undescribed", () => {
    state.resource = { loading: false, error: false, data: data([page({ slots: slots(4), filled: 4, claimable: false }), page({ pageNo: 2 })]), retry: vi.fn() };
    const { container } = ui();
    const open = screen.getByRole("button", { name: "하트 받기" }) as HTMLButtonElement;
    expect(open.disabled).toBe(false);
    expect(open.hasAttribute("aria-describedby")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "이전 쪽" }));
    const disabled = screen.getByRole("button", { name: "하트 받기" }) as HTMLButtonElement;
    expect(disabled.disabled).toBe(true);
    expect(container.querySelector(`#${disabled.getAttribute("aria-describedby")}`)?.textContent).toBe("9칸을 모두 채우면 하트를 받아요");
  });
  it("says what to do in each slot of the first page and nothing invented on later pages", () => {
    state.resource = { loading: false, error: false, data: data([page({ slots: slots(0), filled: 0, claimable: false }), page({ pageNo: 2, slots: slots(0).map(slot => ({ ...slot, kind: null })), filled: 0, claimable: false })]), retry: vi.fn() };
    const { container } = render(<PassportMissionBook passportId="p" creatorSlug="elina" locale="ko" />);
    expect(screen.getByText("팬게시판에 글을 올려요")).toBeTruthy();
    expect(screen.getByText("문제를 풀면 팬 인증이 돼요")).toBeTruthy();
    expect(screen.getByText("며칠 연속으로 출석해요")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "다음 쪽" }));
    expect(container.querySelectorAll("[data-current] [data-slot-task]")).toHaveLength(0);
    expect(screen.getAllByRole("checkbox")).toHaveLength(9);
  });
  it("opens on the page ready to claim, then the one still filling, and pages with 44px controls", () => {
    state.resource = { loading: false, error: false, data: data([page({ claimed: true, claimable: false }), page({ pageNo: 2, slots: slots(0), filled: 0, claimable: false })], 1), retry: vi.fn() };
    const { container } = ui();
    expect(screen.getByRole("heading", { name: "2쪽" })).toBeTruthy();
    expect(container.querySelector("[data-current] [data-testid='passport-page-indicator']")?.textContent).toBe("2/2");
    expect((screen.getByRole("button", { name: "다음 쪽" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "이전 쪽" }));
    expect(screen.getByText("하트 받음")).toBeTruthy();
  });
  it("locks the second page until the jjinfan title and links to certifications", () => {
    state.resource = { loading: false, error: false, data: data([page({ claimed: true, claimable: false }), page({ pageNo: 2, slots: slots(3), filled: 3, claimable: false, locked: true, lockedReason: "jjinfan_required" })], 1), retry: vi.fn() };
    ui("en");
    fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
    expect(screen.getByText("Heart claimed")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    const link = screen.getByRole("link", { name: "Claim after verifying" });
    expect(link.getAttribute("href")).toBe("/c/c1/certifications?locale=en");
    expect(screen.queryByRole("button", { name: "Claim heart" })).toBeNull();
  });
  it("disables claim for an incomplete page", () => {
    state.resource = { loading: false, error: false, data: data([page({ filled: 4, slots: slots(4), claimable: false })]), retry: vi.fn() };
    ui();
    expect((screen.getByRole("button", { name: "하트 받기" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("shows an error with retry and a loading placeholder", () => {
    const retry = vi.fn();
    state.resource = { loading: false, error: true, data: undefined, retry };
    ui();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(retry).toHaveBeenCalled();
    cleanup();
    state.resource = { loading: true, error: false, data: undefined, retry };
    expect(ui().container.querySelector("[aria-busy='true']")).not.toBeNull();
  });
  it("reports a failed claim", async () => {
    state.request = vi.fn().mockRejectedValue(new Error("boom"));
    state.resource = { loading: false, error: false, data: data([page({})]), retry: vi.fn() };
    ui("ru");
    fireEvent.click(screen.getAllByRole("button").at(-1)!);
    expect((await screen.findByRole("alert")).textContent).toBe("Не удалось получить сердце");
  });
  it("stacks earned stamps nine a page while the policy is off, opening on the page still filling", () => {
    const stamps = Array.from({ length: 10 }, (_, i) => ({ id: `s${i}`, src: `/stamp-${i}.webp` }));
    render(<StackedStampPages stamps={stamps} locale="ko" />);
    expect(screen.getByTestId("passport-page-indicator").textContent).toBe("2/2");
    expect(screen.getAllByRole("checkbox").filter(el => el.getAttribute("aria-checked") === "true")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "2쪽" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "이전 쪽" }));
    expect(screen.getAllByRole("checkbox").filter(el => el.getAttribute("aria-checked") === "true")).toHaveLength(9);
  });
  it("K8: every page of the book is in the page area from the first paint, only the current one shown and reachable, whichever page it opens on", () => {
    state.resource = { loading: false, error: false, data: data([page({ slots: slots(9), filled: 9, claimable: true }), page({ pageNo: 2, slots: slots(3), filled: 3, claimable: false, locked: true, lockedReason: "jjinfan_required" }), page({ pageNo: 3, slots: slots(0), filled: 0, claimable: false, locked: true, lockedReason: "jjinfan_required" })], 1), retry: vi.fn() };
    const { container } = ui();
    const area = container.querySelector("[data-stacked]")!;
    expect(area.children).toHaveLength(3);
    const current = () => [...area.children].filter(child => child.hasAttribute("data-current"));
    expect(current()).toHaveLength(1);
    for (const child of area.children) if (!child.hasAttribute("data-current")) { expect(child.hasAttribute("inert")).toBe(true); expect(child.getAttribute("aria-hidden")).toBe("true"); }
    const opened = current()[0];
    fireEvent.click(screen.getByRole("button", { name: "다음 쪽" }));
    expect(area.children).toHaveLength(3);
    expect(current()[0]).not.toBe(opened);
    fireEvent.click(screen.getByRole("button", { name: "이전 쪽" }));
    expect(current()[0]).toBe(opened);
  });
  it("K8: turning to a shorter page keeps the book's height (the tallest page seen holds the space)", () => {
    const heights = [520, 430];
    let call = 0;
    const spy = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) { return this.tagName === "SECTION" ? heights[Math.min(call++, 1)]! : 0; });
    const stamps = Array.from({ length: 10 }, (_, i) => ({ id: `s${i}`, src: `/stamp-${i}.webp` }));
    render(<StackedStampPages stamps={stamps} locale="ko" />);
    const pages = screen.getByRole("heading", { name: "2쪽" }).closest("section")!.parentElement as HTMLElement;
    expect(pages.style.minHeight).toBe("520px");
    fireEvent.click(screen.getByRole("button", { name: "이전 쪽" }));
    expect(pages.style.minHeight).toBe("520px");
    spy.mockRestore();
  });
  it("keeps one page and no page control for zero stamps", () => {
    render(<StackedStampPages stamps={[]} locale="ko" />);
    expect(screen.getAllByRole("checkbox")).toHaveLength(9);
    expect(screen.queryByTestId("passport-page-indicator")).toBeNull();
  });
  it("exports the slot table for the MY card", () => {
    expect(Object.keys(SLOT)).toEqual(KINDS);
  });
  it("sends each open mission to where it can be done, and leaves filled slots still", () => {
    const open = slots(0);
    state.resource = { loading: false, error: false, data: data([page({ slots: open, filled: 0, claimable: false })]), retry: vi.fn() };
    const { container } = render(<PassportMissionBook passportId="p" creatorSlug="elina" locale="ko" />);
    // 받지 않은 칸은 받은 칸과 같은 그림을 흐린 회색(ghost-v1)으로 놓는다.
    const ghosts = container.querySelectorAll<HTMLImageElement>('[data-state="empty"] img');
    expect(ghosts.length).toBeGreaterThan(0);
    ghosts.forEach(image => expect(image.getAttribute("src")).toMatch(/^\/images\/stamps\/ghost-v1\/[a-z-]+\.webp$/));
    expect(screen.getByRole("link", { name: /글쓰기/ }).getAttribute("href")).toBe("/elina?tab=board&source=fans&compose=1&locale=ko");
    expect(screen.getByRole("link", { name: /친구 추천/ }).getAttribute("href")).toBe("/my/invitations?locale=ko");
    expect(screen.getByRole("button", { name: "자세히 입국 심사 설명 보기" })).toBeTruthy();
  });
  it("shows the onboarding once, with up to three open missions that link to their place", () => {
    localStorage.removeItem("kyaa:passport:mission-onboarding:v1");
    state.resource = { loading: false, error: false, data: data([page({ slots: slots(0), filled: 0, claimable: false })]), retry: vi.fn() };
    const first = render(<PassportMissionBook passportId="p" creatorSlug="elina" locale="ko" />);
    const dialog = screen.getByRole("dialog", { name: "덕질을 누르면 바로 할 수 있어요" });
    expect(dialog.querySelectorAll("a")).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "확인" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    first.unmount();
    render(<PassportMissionBook passportId="p" creatorSlug="elina" locale="ko" />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("missionHref", () => {
  it("sends the entry review slot to the quiz, not the certification table", () => {
    expect(missionHref("quiz", "elina", "p", "ko")).toBe("/c/elina/verify?locale=ko");
  });
});
