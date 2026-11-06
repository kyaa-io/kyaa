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

import { PassportMissionBook } from "./passport-mission-book";

const KINDS = ["quiz", "checkin", "post", "comment", "share", "invite", "subscription", "steady_checkin", "proof"];
const slots = (filled: number) => KINDS.map((kind, i) => ({ slotNo: i + 1, kind, state: i < filled ? "filled" : "empty", stampId: i < filled ? "00000000-0000-4000-8000-00000000000" + (i + 1) : null, clearedAt: i < filled ? "2026-11-06T00:00:00Z" : null }));
const page = (over: Record<string, unknown>) => ({ pageNo: 1, slots: slots(9), filled: 9, claimable: true, claimed: false, locked: false, lockedReason: null, ...over });
const data = (pages: unknown[], hearts = 0) => ({ passportId: "00000000-0000-4000-8000-000000000001", celebrityId: "00000000-0000-4000-8000-000000000002", hearts, pages });
const ui = (locale: "ko" | "en" | "ru" = "ko") => render(<PassportMissionBook passportId="p1" creatorSlug="c1" locale={locale} />);

beforeEach(() => { state.status = "on"; state.request = vi.fn().mockResolvedValue({ hearts: 1, pageNo: 1, jjinfanConfirmed: false, cheerStampId: null, replayed: false }); });
afterEach(cleanup);

describe("PassportMissionBook", () => {
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
    expect(states.filter(value => value === "true")).toHaveLength(7);
    expect(states.filter(value => value === "false")).toHaveLength(11);
    expect(screen.getAllByRole("checkbox").every(el => el.getAttribute("aria-disabled") === "true" && !el.hasAttribute("tabindex"))).toBe(true);
    expect(container.querySelectorAll("[data-state='filled']:not([data-kind]) svg")).toHaveLength(3);
    expect(container.querySelectorAll("[data-state='empty']:not([data-kind]) svg")).toHaveLength(0);
  });
  it("explains a disabled claim with what is missing and leaves an open claim undescribed", () => {
    state.resource = { loading: false, error: false, data: data([page({ slots: slots(4), filled: 4, claimable: false }), page({ pageNo: 2 })]), retry: vi.fn() };
    const { container } = ui();
    const [disabled, open] = screen.getAllByRole("button", { name: "하트 받기" }) as HTMLButtonElement[];
    expect(disabled.disabled).toBe(true);
    expect(container.querySelector(`#${disabled.getAttribute("aria-describedby")}`)?.textContent).toBe("9칸을 모두 채우면 받을 수 있어요");
    expect(open.disabled).toBe(false);
    expect(open.hasAttribute("aria-describedby")).toBe(false);
  });
  it("says what to do in each slot of the first page and nothing invented on later pages", () => {
    state.resource = { loading: false, error: false, data: data([page({ slots: slots(0), filled: 0, claimable: false }), page({ pageNo: 2, slots: slots(0).map(slot => ({ ...slot, kind: null })), filled: 0, claimable: false })]), retry: vi.fn() };
    const { container } = render(<PassportMissionBook passportId="p" creatorSlug="elina" locale="ko" />);
    expect(screen.getByText("팬게시판에 글을 올려요")).toBeTruthy();
    expect(screen.getByText("입국 심사 문제를 풀어요")).toBeTruthy();
    expect(screen.getByText("며칠 연속으로 출석해요")).toBeTruthy();
    expect(container.querySelectorAll("section section")[1].querySelectorAll("li span").length).toBe(18);
  });
  it("locks the second page until the jjinfan title and links to certifications", () => {
    state.resource = { loading: false, error: false, data: data([page({ claimed: true }), page({ pageNo: 2, locked: true, lockedReason: "jjinfan_required" })], 1), retry: vi.fn() };
    ui("en");
    expect(screen.getByText("Heart claimed")).toBeTruthy();
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
    fireEvent.click(screen.getByRole("button"));
    expect((await screen.findByRole("alert")).textContent).toBe("Не удалось получить сердце");
  });
});
