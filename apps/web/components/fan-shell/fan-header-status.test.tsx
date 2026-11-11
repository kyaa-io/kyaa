import { fireEvent, render, screen } from "@testing-library/react";
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
const chip = () => screen.getByRole("link", { name: /내 팬 활동/ });

beforeEach(() => {
  state.auth = { authenticated: true, ownerKey: "member:0", ready: true };
  state.bias = { status: "ready", selected, unverified: null, options: [selected], select: vi.fn(), retry: vi.fn() };
  state.wallet = { data: { points: 1260 }, error: false, failure: undefined, retry: vi.fn() };
});

describe("header capsule", () => {
  it("is one link to MY and opens no panel", () => {
    render(<FanHeaderStatus locale="ko" />);
    const link = chip();
    expect(link).toHaveAttribute("href", "/my?locale=ko");
    expect(link).toHaveTextContent("1,260");
    expect(link.querySelector('img[src="/images/economy/point-coin.svg"]')).not.toBeNull();
    expect(link.querySelector('img[src="/images/economy/heart.svg"]')).not.toBeNull();
    fireEvent.click(link);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(link).not.toHaveAttribute("aria-expanded");
  });

  it("re-reads the wallet and the hearts when the wallet changes", () => {
    render(<FanHeaderStatus locale="ko" />);
    window.dispatchEvent(new Event("wallet-changed"));
    expect(state.wallet.retry).toHaveBeenCalledOnce();
    expect(state.bias.retry).toHaveBeenCalledOnce();
  });

  it("keeps the guest login entry and never exposes retained member data", () => {
    const view = render(<FanHeaderStatus locale="ko" />);
    state.auth = { ...state.auth, authenticated: false, ownerKey: "guest:1" };
    view.rerender(<FanHeaderStatus locale="ko" />);
    expect(screen.getByRole("link", { name: "최애 고르기" })).toHaveAttribute("href", "/login");
    expect(screen.queryByText(/1,260|Current favorite/)).not.toBeInTheDocument();
  });

  it.each([401, 403])("hides retained member data after a %i wallet response", status => {
    state.wallet.failure = { status };
    render(<FanHeaderStatus locale="ko" />);
    expect(screen.getByRole("link")).toHaveAttribute("href", expect.stringContaining("/login"));
    expect(screen.queryByText(/1,260/)).not.toBeInTheDocument();
  });

  it("omits unknown hearts and leaves unknown points blank", () => {
    state.bias = { ...state.bias, selected: { ...selected, hearts: undefined }, status: "error" };
    state.wallet = { ...state.wallet, data: undefined, error: true };
    render(<FanHeaderStatus locale="ko" />);
    expect(chip()).toHaveTextContent("—");
    expect(chip().querySelector('img[src="/images/economy/heart.svg"]')).toBeNull();
    expect(chip()).not.toHaveAccessibleName(/하트 0/);
  });

  it("compacts large visible values but keeps the full counts accessible", () => {
    state.wallet.data = { points: 1234567 };
    state.bias.selected = { ...selected, hearts: 1234567 };
    render(<FanHeaderStatus locale="ko" />);
    expect(chip()).not.toHaveTextContent("1,234,567");
    expect(chip()).toHaveAccessibleName(/하트 1,234,567/);
    expect(chip()).toHaveAccessibleName(/포인트 1,234,567/);
  });

  it.each(APP_LOCALES)("provides translated labels in %s", locale => {
    render(<FanHeaderStatus locale={locale} />);
    const c = headerStatusCopy(locale);
    expect(screen.getByRole("link")).toHaveAttribute("href", `/my?locale=${locale}`);
    expect(Object.values(c).every(value => value.length > 0)).toBe(true);
  });
});
