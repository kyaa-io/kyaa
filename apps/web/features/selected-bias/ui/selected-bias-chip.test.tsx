import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { SelectedBiasChip } from "./selected-bias-chip";

const state = vi.hoisted(() => ({ auth: { ready: true, authenticated: true, user: { id: "owner" } } as { ready: boolean; authenticated: boolean; user: { id: string } | null }, summary: { state: { status: "loading" } as unknown, retry: () => {} } }));
vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => state.auth }));
vi.mock("@/components/fan-ui/use-owned-fan-resource", () => ({ useOwnedFanResource: () => state.summary }));
vi.mock("next/navigation", () => ({ usePathname: () => "/my", useSearchParams: () => new URLSearchParams("locale=ko") }));

const creator = (slug: string, name: string, passport: boolean, hearts?: number) => ({ celebrity: { slug, name, image: "/a.png" }, relationship: passport ? "passport" : "first_reaction_only", passport: passport ? { id: `${slug}-p`, tier: "Silver", score: 0, remainingToNextTier: 0, stageProgress: null, ...(hearts === undefined ? {} : { hearts }) } : null, ticketBalance: 0, firstReaction: null });
const ready = (...creators: unknown[]) => { state.summary = { state: { status: "ready", data: { creators, favorite: favorite.slug ? { slug: favorite.slug, name: favorite.slug } : null } }, retry: () => {} }; };
const favorite = { slug: null as string | null };

beforeEach(() => { favorite.slug = "elina"; window.localStorage.clear(); state.auth = { ready: true, authenticated: true, user: { id: "owner" } }; });

it("shows the favorite named in MY with its tier", () => {
  ready(creator("elina", "엘리나", true), creator("p1", "시험", true));
  render(<SelectedBiasChip locale="ko" />);
  const chip = document.querySelector("[data-selected-bias]")!;
  expect(chip).toHaveAttribute("data-selected-bias", "selected");
  expect(chip).toHaveTextContent("엘리나");
  expect(chip).toHaveTextContent("실버");
  expect(chip).not.toHaveTextContent("최애 고르기");
});
it("shows the named favorite among several passports", () => {
  favorite.slug = "p1";
  ready(creator("elina", "엘리나", true), creator("p1", "시험", true));
  render(<SelectedBiasChip locale="ko" />);
  expect(screen.getByRole("button")).toHaveTextContent("시험");
});
it("shows a favorite without a passport by name, leading to its page", () => {
  ready(creator("elina", "엘리나", false));
  render(<SelectedBiasChip locale="ko" />);
  const link = screen.getByRole("link");
  expect(link).toHaveTextContent("엘리나");
  expect(link).toHaveAttribute("href", "/elina?locale=ko");
});
it("asks to choose only with no favorite at all", () => {
  ready();
  render(<SelectedBiasChip locale="ko" />);
  expect(screen.getByRole("link")).toHaveTextContent("최애 고르기");
});
it("does not say choose while the login or the summary is still loading", () => {
  state.summary = { state: { status: "loading" }, retry: () => {} };
  const { container, rerender } = render(<SelectedBiasChip locale="ko" />);
  expect(container).not.toHaveTextContent("최애 고르기");
  state.auth = { ready: false, authenticated: false, user: null };
  rerender(<SelectedBiasChip locale="ko" />);
  expect(container).not.toHaveTextContent("최애 고르기");
});

it("reads tier · favorite · ♥hearts of the selected favorite, from the summary (C1)", () => {
  favorite.slug = "p1";
  ready(creator("elina", "엘리나", true, 3), creator("p1", "시험", true, 12));
  render(<SelectedBiasChip locale="ko" />);
  const chip = document.querySelector("[data-selected-bias]")!;
  expect(chip.textContent).toMatch(/^실버.*시험.*12$/);
  expect(chip).not.toHaveTextContent("°");
});
it("shows 0 hearts as 0", () => {
  ready(creator("elina", "엘리나", true, 0));
  render(<SelectedBiasChip locale="ko" />);
  expect(screen.getByRole("link", { name: "엘리나에서 모은 하트 0개" })).toHaveAttribute("data-hearts", "0");
});
it("sends each header cell to its own place: tier guide, favorite menu, the favorite's fans tab (F10)", () => {
  ready(creator("elina", "엘리나", true, 3));
  render(<SelectedBiasChip locale="ko" />);
  const tier = document.querySelector("[data-cell=tier]")!;
  expect(tier).toHaveAttribute("href", "/guide/jjinfan?locale=ko");
  expect(tier.getAttribute("aria-label")).toMatch(/^실버/);
  const favorite = screen.getByRole("button");
  expect(favorite).toHaveAttribute("data-cell", "favorite");
  expect(favorite.getAttribute("aria-label")).toMatch(/^내 최애 엘리나, 등급 실버.*눌러서 바꾸기$/);
  expect(screen.getByRole("link", { name: "엘리나에서 모은 하트 3개" })).toHaveAttribute("href", "/elina?tab=fans&locale=ko");
});
it("draws no hearts number when the summary carried none (its hearts read failed)", () => {
  ready(creator("elina", "엘리나", true));
  render(<SelectedBiasChip locale="ko" />);
  expect(document.querySelector("[data-cell=hearts]")).toBeNull();
  expect(document.querySelector("[data-selected-bias]")).toHaveTextContent("엘리나");
});

it("D2: with passports but no favorite named, 최애 고르기 opens the favorite menu instead of leading away", () => {
  favorite.slug = null;
  ready(creator("elina", "엘리나", true), creator("p1", "시험", true));
  render(<SelectedBiasChip locale="ko" />);
  const pick = screen.getByRole("button", { name: /최애 고르기/ });
  expect(pick).toHaveAttribute("data-selected-bias", "unnamed");
  expect(document.querySelector("[data-cell=hearts]")).toBeNull();
});
it("does not read the old browser choice as the favorite", () => {
  favorite.slug = null;
  window.localStorage.setItem("kyaa:selected-bias:v1:owner", "p1");
  ready(creator("elina", "엘리나", true), creator("p1", "시험", true));
  render(<SelectedBiasChip locale="ko" />);
  expect(document.querySelector("[data-selected-bias]")).not.toHaveTextContent("시험");
});
