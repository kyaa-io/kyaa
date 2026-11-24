import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SelectedBias, SelectedBiasOption } from "@/features/selected-bias/ui/use-selected-bias";
import { APP_LOCALES } from "@/i18n/locales";
import { headerStatusCopy } from "./fan-header-status-copy";

const state = vi.hoisted(() => ({
  pathname: "/benefits",
  auth: { authenticated: true, ownerKey: "member:0", ready: true },
  bias: {} as SelectedBias,
  wallet: { data: { points: 1260 } as { points: number } | undefined, error: false, failure: undefined as { status: number } | undefined, retry: vi.fn() },
}));
vi.mock("@/features/groups/ui/use-group-resource", () => ({ useGroupRequest: () => state.auth, useGroupResource: () => state.wallet, GROUP_WALLET_CHANGED_EVENT: "wallet-changed" }));
vi.mock("@/features/selected-bias/ui/use-selected-bias", () => ({ useSelectedBias: () => state.bias }));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname, useSearchParams: () => new URLSearchParams("locale=ko") }));
import { FanHeaderStatus } from "./fan-header-status";

const selected = { slug: "favorite-a", name: "Current favorite", tier: "Bronze", hearts: 0, image: "", passportId: "passport-a", stage: null } satisfies SelectedBiasOption;
const chip = () => screen.getByRole("link", { name: /내 팬 활동/ });

beforeEach(() => {
  state.pathname = "/benefits";
  state.auth = { authenticated: true, ownerKey: "member:0", ready: true };
  state.bias = { status: "ready", selected, unverified: null, options: [selected], select: vi.fn(), retry: vi.fn() };
  state.wallet = { data: { points: 1260 }, error: false, failure: undefined, retry: vi.fn() };
});

describe("header capsule", () => {
  it("is one link to MY and opens no panel", () => {
    render(<FanHeaderStatus locale="ko" />);
    const link = chip();
    expect(link).toHaveAttribute("href", "/my?locale=ko&passport=favorite-a#my-passport");
    expect(link).toHaveTextContent("1,260");
    expect(link.querySelector('img[src="/images/economy/point-coin.webp"]')).not.toBeNull();
    expect(link.querySelector('img[src="/images/dukjil-duo/glyph-heart-160.webp"]')).toBeNull();
    fireEvent.click(link);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(link).not.toHaveAttribute("aria-expanded");
  });

  it.each(["/", "/pages/groups", "/chemi", "/my", "/knowingstudy"])("shows one tier badge and points on %s", pathname => {
    state.pathname = pathname;
    state.bias.selected = { ...selected, tier: "Gold", hearts: 17 };
    state.wallet.data = { points: 987654321 };
    render(<FanHeaderStatus locale="ko" />);
    const link = chip();
    expect(link).toHaveAccessibleName(/골드.*포인트 987,654,321/);
    expect(link).not.toHaveAccessibleName(/하트/);
    expect(link).not.toHaveTextContent("골드");
    expect(link.querySelectorAll("img")).toHaveLength(2);
    expect(link.querySelector('img[src*="/tiers/medal-v2/gold-1.svg"]')).not.toBeNull();
  });

  it("shows the named favorite grade before points even with a higher passport", () => {
    state.bias.options = [{ ...selected, slug: "other", tier: "Gold" }, selected];
    render(<FanHeaderStatus locale="ko" />);
    const label = chip().querySelector("[data-header-tier]")!;
    expect(label.nextElementSibling).toHaveTextContent("1,260");
    expect(label.querySelector("img")?.getAttribute("src")).toContain("/images/passport/tiers/medal-v2/bronze-1.svg");
    expect(chip()).toHaveAccessibleName(/브론즈/);
  });

  it("shows the highest passport grade when no favorite is named", () => {
    const gold = { ...selected, slug: "other", tier: "Gold", stage: { key: "gold-2", tier: "Gold", subdivision: 2 } } satisfies SelectedBiasOption;
    state.bias.selected = null;
    state.bias.options = [selected, gold];
    render(<FanHeaderStatus locale="ko" />);
    expect(chip()).toHaveAttribute("href", "/my?locale=ko&passport=other#my-passport");
    expect(chip().querySelector("[data-header-tier]")).toHaveAttribute("title", "골드");
    expect(chip().querySelector('img[src*="/tiers/medal-v2/gold-2.svg"]')).not.toBeNull();
  });

  it("omits the grade without any passport", () => {
    state.bias = { ...state.bias, status: "empty", selected: null, options: [] };
    render(<FanHeaderStatus locale="ko" />);
    expect(chip()).toHaveAttribute("href", "/my?locale=ko");
    expect(chip().querySelector("[data-header-tier]")).toBeNull();
  });

  it("re-reads the wallet and the hearts when the wallet changes", () => {
    render(<FanHeaderStatus locale="ko" />);
    window.dispatchEvent(new Event("wallet-changed"));
    expect(state.wallet.retry).toHaveBeenCalledOnce();
    expect(state.bias.retry).toHaveBeenCalledOnce();
  });

  it("signed out shows only the small login link — no join chip, no retained member data", () => {
    const view = render(<FanHeaderStatus locale="ko" />);
    state.auth = { ...state.auth, authenticated: false, ownerKey: "guest:1" };
    view.rerender(<FanHeaderStatus locale="ko" />);
    expect(screen.getByRole("link", { name: "로그인" })).toHaveAttribute("href", expect.stringContaining("/login"));
    expect(screen.queryByText("모임에 가입해보세요")).not.toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
    expect(screen.queryByText(/1,260|Current favorite/)).not.toBeInTheDocument();
  });

  it("signed in without a favorite keeps the compact capsule with points only — no illustration, no join prompt", () => {
    state.bias = { status: "empty", selected: null, unverified: null, options: [], select: vi.fn(), retry: vi.fn() };
    render(<FanHeaderStatus locale="ko" />);
    expect(chip()).toHaveAttribute("href", "/my?locale=ko");
    expect(chip()).toHaveTextContent("1,260");
    expect(screen.queryByText("모임에 가입해보세요")).not.toBeInTheDocument();
    expect(chip().querySelector('img[src*="join-community"]')).toBeNull();
    expect(document.querySelector("[data-header-tier]")).toBeNull();
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
    expect(chip()).toHaveTextContent(/^$/);
    expect(chip().querySelector('img[src="/images/dukjil-duo/glyph-heart-160.webp"]')).toBeNull();
    expect(chip()).not.toHaveAccessibleName(/하트 0/);
  });

  it("compacts large visible values but keeps the full counts accessible", () => {
    state.wallet.data = { points: 1234567 };
    state.bias.selected = { ...selected, hearts: 1234567 };
    render(<FanHeaderStatus locale="ko" />);
    expect(chip()).not.toHaveTextContent("1,234,567");
    expect(chip()).not.toHaveAccessibleName(/하트 1,234,567/);
    expect(chip()).toHaveAccessibleName(/포인트 1,234,567/);
  });

  it.each([["ko", "브론즈"], ["en", "Bronze"], ["ja", "ブロンズ"]] as const)("displays the grade name in %s", (locale, grade) => {
    render(<FanHeaderStatus locale={locale} />);
    expect(screen.getByRole("link")).toHaveAccessibleName(new RegExp(grade));
  });

  it.each(APP_LOCALES)("provides translated labels in %s", locale => {
    render(<FanHeaderStatus locale={locale} />);
    const c = headerStatusCopy(locale);
    expect(screen.getByRole("link")).toHaveAttribute("href", `/my?locale=${locale}&passport=favorite-a#my-passport`);
    expect(Object.values(c).every(value => value.length > 0)).toBe(true);
  });
});
