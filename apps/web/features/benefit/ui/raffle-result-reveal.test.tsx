import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OwnedRaffleResult } from "../domain/raffle-result";
import { RaffleResultPanel } from "./raffle-result-panel";

const won: OwnedRaffleResult = {
  benefitId: "11111111-1111-4111-8111-111111111111", campaignId: "22222222-2222-4222-8222-222222222222",
  title: "한정판 경품", benefitHref: "/benefits/11111111-1111-4111-8111-111111111111", state: "won",
  enteredTickets: 4, entryClosesAt: "2026-09-20T00:00:00+09:00", publishedAt: "2026-09-21T00:00:00+09:00",
  winnerId: "33333333-3333-4333-8333-333333333333", method: "physical_shipping", fulfillmentStatus: "information_required",
  claimDisposition: "active", recipientDeadlineAt: "2099-09-28T00:00:00+09:00", recipientSubmitted: false, recipientEditable: true, policy: null,
};
const lost: OwnedRaffleResult = { ...won, state: "not_won", winnerId: null, fulfillmentStatus: null, recipientEditable: false, recipientDeadlineAt: null };
describe("raffle result reveal", () => {
  beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(); vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {}); });
  afterEach(() => {
    cleanup(); vi.useRealTimers(); vi.restoreAllMocks();
  });

  it("plays the approved mix then draw once, and exposes the real recipient route", async () => {
    render(<RaffleResultPanel result={won} locale="ko" ownerId="owner-a" />);
    fireEvent.click(screen.getByRole("button", { name: "내 결과 확인하기" }), { detail: 1 });
    expect(document.querySelector("video")).toHaveAttribute("src", "/images/lotto/mix.mp4");
    await act(() => vi.advanceTimersByTimeAsync(4999));
    expect(screen.queryByRole("heading", { name: "당첨됐어요" })).not.toBeInTheDocument();
    expect(localStorage.length).toBe(0);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(document.querySelector("video")).toHaveAttribute("src", "/images/lotto/draw.mp4");
    expect(document.querySelector("video")).not.toHaveAttribute("loop");
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(document.querySelector("video")).toBeNull();
    expect(screen.getByRole("heading", { name: "당첨됐어요" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "수령 정보 입력하기" })).toHaveAttribute("href", `/my/rewards/${won.winnerId}/recipient?locale=ko`);
    expect(localStorage.length).toBe(1);
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  });

  it("skips, focuses the result, remembers it, and isolates another account/publication", () => {
    const view = render(<RaffleResultPanel result={won} locale="ko" ownerId="owner-a" />);
    fireEvent.click(screen.getByRole("button", { name: "바로 결과 보기" }));
    expect(screen.getByRole("heading", { name: "당첨됐어요" })).toHaveFocus();
    view.unmount();
    const next = render(<RaffleResultPanel result={won} locale="ko" ownerId="owner-a" />);
    expect(screen.queryByRole("button", { name: "내 결과 확인하기" })).not.toBeInTheDocument();
    next.rerender(<RaffleResultPanel result={won} locale="ko" ownerId="owner-b" />);
    expect(screen.queryByRole("heading", { name: "당첨됐어요" })).not.toBeInTheDocument();
    next.rerender(<RaffleResultPanel result={{ ...won, publishedAt: "2026-10-01T00:00:00Z" }} locale="ko" ownerId="owner-a" />);
    expect(screen.getByRole("button", { name: "내 결과 확인하기" })).toBeInTheDocument();
  });

  it("uses the non-winning artwork and destination without confetti", async () => {
    render(<RaffleResultPanel result={lost} locale="en" ownerId="owner-a" />);
    fireEvent.click(screen.getByRole("button", { name: "Reveal my result" }));
    await act(() => vi.advanceTimersByTimeAsync(5000));
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(screen.getByRole("heading", { name: "You weren’t selected this time" })).toHaveFocus();
    expect(screen.getByRole("link", { name: "View other raffles" })).toHaveAttribute("href", "/benefits?locale=en");
    expect(document.querySelectorAll("[data-particle]")).toHaveLength(0);
    expect(screen.queryByRole("link", { name: "Enter recipient details" })).not.toBeInTheDocument();
  });

  it("does not remember a reveal abandoned while the tab is hidden or unmounted", async () => {

    const view = render(<RaffleResultPanel result={won} locale="ko" ownerId="owner-a" />);
    fireEvent.click(screen.getByRole("button", { name: "내 결과 확인하기" }));
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    fireEvent(document, new Event("visibilitychange"));
    expect(localStorage.length).toBe(0);
    hidden.mockReturnValue(false);
    fireEvent(document, new Event("visibilitychange"));
    expect(screen.getByRole("button", { name: "내 결과 확인하기" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "내 결과 확인하기" }));
    view.unmount();
    await act(() => vi.advanceTimersByTimeAsync(4000));
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
  });

  it("shows an immediate static result for reduced motion even if storage is unavailable", () => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    vi.spyOn(window, "matchMedia").mockReturnValue({ ...media, matches: true });
    vi.spyOn(localStorage, "getItem").mockImplementation(() => { throw new Error("Blocked"); });
    render(<RaffleResultPanel result={won} locale="en" ownerId="owner-a" />);
    fireEvent.click(screen.getByRole("button", { name: "Reveal my result" }));
    expect(screen.getByRole("heading", { name: "You won" })).toHaveFocus();
    expect(document.querySelector("video")).toBeNull();
  });

  it("keeps the recipient action available when Next Image fails", () => {
    const view = render(<RaffleResultPanel result={{ ...won, imageUrl: "/prizes/missing.jpg" }} locale="ko" ownerId="owner-a" />);
    fireEvent.click(screen.getByRole("button", { name: "바로 결과 보기" }));
    fireEvent.error(view.container.querySelector("[data-result-art] img")!);
    expect(view.container.querySelector("[data-result-art] img")).toBeNull();
    expect(screen.getByRole("link", { name: "수령 정보 입력하기" })).toBeInTheDocument();
  });

  it("falls back to the same static result if playback fails", async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValue(new Error("Playback blocked"));
    render(<RaffleResultPanel result={won} locale="ko" ownerId="owner-a" />);
    fireEvent.click(screen.getByRole("button", { name: "내 결과 확인하기" }));
    await act(async () => {});
    expect(screen.getByRole("heading", { name: "당첨됐어요" })).toBeInTheDocument();
    expect(document.querySelector("video")).toBeNull();
    expect(document.querySelector('img[src="/images/lotto/draw.png"]')).toBeInTheDocument();
  });

  it("stops playback when reduced motion is enabled during a reveal", () => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let changed: (() => void) | undefined;
    vi.spyOn(window, "matchMedia").mockReturnValue({ ...media, matches: false, addEventListener: vi.fn((_name, listener) => { changed = listener as () => void; }), removeEventListener: vi.fn() });
    render(<RaffleResultPanel result={won} locale="en" ownerId="owner-a" />);
    fireEvent.click(screen.getByRole("button", { name: "Reveal my result" }));
    act(() => changed?.());
    expect(document.querySelector("video")).toBeNull();
    expect(screen.getByRole("heading", { name: "You won" })).toBeInTheDocument();
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  });

  it.each([2000, 6000])("skips either clip without a later timer replacing the confirmed result (%sms)", async elapsed => {
    render(<RaffleResultPanel result={lost} locale="en" ownerId="owner-a" />);
    fireEvent.click(screen.getByRole("button", { name: "Reveal my result" }));
    await act(() => vi.advanceTimersByTimeAsync(elapsed));
    fireEvent.click(screen.getByRole("button", { name: "Show result now" }));
    expect(document.querySelector("video")).toBeNull();
    expect(screen.getByRole("heading", { name: "You weren’t selected this time" })).toHaveFocus();
    await act(() => vi.advanceTimersByTimeAsync(20000));
    expect(screen.queryByRole("heading", { name: "You won" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "You weren’t selected this time" })).toBeInTheDocument();
  });

  it("settles on video error and keeps the real fulfillment details", () => {
    render(<RaffleResultPanel result={won} locale="ko" ownerId="owner-a" />);
    fireEvent.click(screen.getByRole("button", { name: "내 결과 확인하기" }));
    fireEvent.error(document.querySelector("video")!);
    expect(screen.getByRole("link", { name: "수령 정보 입력하기" })).toBeInTheDocument();
    expect(document.querySelector("video")).toBeNull();
  });

  it.each(["ready", "shipping_in_transit", "shipping_completed", "pickup_available", "pickup_completed", "digital_delivered"] as const)("never gates fulfillment state %s", (fulfillmentStatus) => {
    render(<RaffleResultPanel result={{ ...won, fulfillmentStatus }} locale="ko" ownerId="owner-a" />);
    expect(screen.queryByRole("button", { name: "내 결과 확인하기" })).not.toBeInTheDocument();
  });
});
