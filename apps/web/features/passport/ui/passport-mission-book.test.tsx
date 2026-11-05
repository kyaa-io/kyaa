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

const KINDS = ["quiz", "daily_checkin", "post", "comment", "share", "invite", "subscription", "steady_checkin", "proof"];
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
