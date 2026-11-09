import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SelectedBias, SelectedBiasOption } from "@/features/selected-bias/ui/use-selected-bias";
import { APP_LOCALES } from "@/i18n/locales";
import { headerStatusCopy } from "./fan-header-status-copy";

const state = vi.hoisted(() => ({
  auth: { authenticated: true, ownerKey: "member:0", ready: true },
  bias: {} as SelectedBias,
  wallet: { data: { points: 1260 } as { points: number } | undefined, error: false, failure: undefined as { status: number } | undefined, retry: vi.fn() },
}));
vi.mock("@/features/groups/ui/use-group-resource", () => ({ useGroupRequest: () => state.auth, useGroupResource: () => state.wallet, GROUP_WALLET_CHANGED_EVENT: "wallet-changed" }));
vi.mock("@/features/selected-bias/ui/use-selected-bias", () => ({ useSelectedBias: () => state.bias }));
vi.mock("@/features/selected-bias/ui/selected-bias-chip", () => ({ SelectedBiasChip: () => <a href="/login">최애 고르기</a> }));
vi.mock("@/features/rewards/ui/fan-tier-badge", () => ({ FanTierBadge: () => <span data-testid="tier" /> }));
vi.mock("next/navigation", () => ({ usePathname: () => "/benefits", useSearchParams: () => new URLSearchParams("locale=ko") }));
import { FanHeaderStatus } from "./fan-header-status";

const selected = { slug: "favorite-a", name: "Current favorite", tier: "Bronze", hearts: 0, image: "", passportId: "passport-a", stage: null } satisfies SelectedBiasOption;
const second = { ...selected, slug: "favorite-b", name: "Second favorite" };
const toggle = () => screen.getByRole("button", { name: /내 팬 활동/ });

beforeEach(() => {
  state.auth = { authenticated: true, ownerKey: "member:0", ready: true };
  state.bias = { status: "ready", selected, unverified: null, options: [selected, second], select: vi.fn(), retry: vi.fn() };
  state.wallet = { data: { points: 1260 }, error: false, failure: undefined, retry: vi.fn() };
});

describe("header capsule", () => {
  it("starts collapsed, expands into three text rows, and toggles closed", () => {
    render(<FanHeaderStatus locale="ko" />);
    const button = toggle();
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveTextContent("P 1,260");
    expect(button).not.toHaveTextContent("Current favorite");
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    fireEvent.click(button);
    const panel = screen.getByRole("region");
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(panel.id).toBe(button.getAttribute("aria-controls"));
    expect(within(panel).getByRole("button", { name: "최애 바꾸기" })).toHaveFocus();
    expect(within(panel).getByRole("link", { name: "등급 안내" })).toHaveAttribute("href", "/guide/jjinfan?locale=ko");
    expect(within(panel).getByRole("link", { name: "덕질" })).toHaveAttribute("href", "/benefits?locale=ko");
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("uses a native button for keyboard activation; Escape closes and returns focus", () => {
    render(<FanHeaderStatus locale="ko" />);
    const button = toggle();
    button.focus();
    expect(button.tagName).toBe("BUTTON");
    expect(button).toHaveAttribute("type", "button");
    // Native Enter/Space activation dispatches a click; jsdom does not synthesize it from key events.
    fireEvent.click(button, { detail: 0 });
    expect(button).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveFocus();
  });

  it("closes on outside pointer and focus, without stealing outside focus", () => {
    render(<><FanHeaderStatus locale="ko" /><button>Outside</button></>);
    fireEvent.click(toggle());
    fireEvent.pointerDown(screen.getByRole("button", { name: "Outside" }));
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle());
    act(() => screen.getByRole("button", { name: "Outside" }).focus());
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "Outside" })).toHaveFocus();
  });

  it("keeps logical Tab exit order across the portal", () => {
    render(<FanHeaderStatus locale="ko" />);
    fireEvent.click(toggle());
    fireEvent.keyDown(screen.getByRole("button", { name: "최애 바꾸기" }), { key: "Tab", shiftKey: true });
    expect(toggle()).toHaveFocus();
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle());
    screen.getByRole("link", { name: "덕질" }).focus();
    // The browser's default Tab then advances from this header trigger to the next header control.
    expect(fireEvent.keyDown(document.activeElement!, { key: "Tab" })).toBe(true);
    expect(toggle()).toHaveFocus();
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
  });

  it("changes favorite through the existing save hook and restores focus", () => {
    render(<FanHeaderStatus locale="ko" />);
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole("button", { name: "최애 바꾸기" }));
    expect(screen.getByRole("button", { name: "Current favorite" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Current favorite" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Second favorite" }));
    expect(state.bias.select).toHaveBeenCalledWith("favorite-b");
    expect(toggle()).toHaveFocus();
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
  });

  it("closes with Escape while choosing a favorite", () => {
    render(<FanHeaderStatus locale="ko" />);
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole("button", { name: "최애 바꾸기" }));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(toggle()).toHaveFocus();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("discards the open panel when the account changes", () => {
    const view = render(<FanHeaderStatus locale="ko" />);
    fireEvent.click(toggle());
    state.auth = { ...state.auth, ownerKey: "other:1" };
    view.rerender(<FanHeaderStatus locale="ko" />);
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps the guest login entry and never exposes retained member data", () => {
    const view = render(<FanHeaderStatus locale="ko" />);
    fireEvent.click(toggle());
    state.auth = { ...state.auth, authenticated: false, ownerKey: "guest:1" };
    view.rerender(<FanHeaderStatus locale="ko" />);
    expect(screen.getByRole("link", { name: "최애 고르기" })).toHaveAttribute("href", "/login");
    expect(screen.queryByText(/1,260|Current favorite/)).not.toBeInTheDocument();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it.each([401, 403])("hides retained member data after a %i wallet response", status => {
    state.wallet.failure = { status };
    render(<FanHeaderStatus locale="ko" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", expect.stringContaining("/login"));
    expect(screen.queryByText(/1,260/)).not.toBeInTheDocument();
  });

  it("omits unknown hearts, leaves unknown points blank, and retries failed reads", () => {
    state.bias = { ...state.bias, selected: { ...selected, hearts: undefined }, status: "error" };
    state.wallet = { ...state.wallet, data: undefined, error: true };
    render(<FanHeaderStatus locale="ko" />);
    expect(toggle()).toHaveTextContent("P —");
    expect(toggle()).not.toHaveAccessibleName(/하트 0/);
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole("button", { name: /최애 바꾸기 ·/ }));
    fireEvent.click(screen.getByRole("button", { name: /포인트 ·/ }));
    expect(state.bias.retry).toHaveBeenCalledOnce();
    expect(state.wallet.retry).toHaveBeenCalledOnce();
  });

  it("compacts large visible values but keeps the full counts accessible", () => {
    state.wallet.data = { points: 1234567 };
    state.bias.selected = { ...selected, hearts: 1234567 };
    render(<FanHeaderStatus locale="ko" />);
    expect(toggle()).not.toHaveTextContent("1,234,567");
    expect(toggle()).toHaveAccessibleName(/하트 1,234,567/);
    expect(toggle()).toHaveAccessibleName(/포인트 1,234,567/);
  });

  it.each(APP_LOCALES)("provides translated actions in %s", locale => {
    render(<FanHeaderStatus locale={locale} />);
    const c = headerStatusCopy(locale);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button", { name: c.changeFavorite })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: c.tierGuide })).toHaveAttribute("href", `/guide/jjinfan?locale=${locale}`);
    expect(Object.values(c).every(value => value.length > 0)).toBe(true);
  });
});
