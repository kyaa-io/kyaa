import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { SelectedBiasChip } from "./selected-bias-chip";

const state = vi.hoisted(() => ({ auth: { ready: true, authenticated: true, user: { id: "owner" } } as { ready: boolean; authenticated: boolean; user: { id: string } | null }, summary: { state: { status: "loading" } as unknown, retry: () => {} } }));
vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => state.auth }));
vi.mock("@/components/fan-ui/use-owned-fan-resource", () => ({ useOwnedFanResource: () => state.summary }));
const dukjil = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("@/features/dukjil/ui/dukjil-provider", () => ({ DukjilProvider: ({ children }: { children: unknown }) => children, useDukjil: () => dukjil.value }));
vi.mock("next/navigation", () => ({ usePathname: () => "/my", useSearchParams: () => new URLSearchParams("locale=ko") }));

const creator = (slug: string, name: string, passport: boolean) => ({ celebrity: { slug, name, image: "/a.png" }, relationship: passport ? "passport" : "first_reaction_only", passport: passport ? { id: `${slug}-p`, tier: "Silver", score: 0, remainingToNextTier: 0, stageProgress: null } : null, ticketBalance: 0, firstReaction: null });
const ready = (...creators: unknown[]) => { state.summary = { state: { status: "ready", data: { creators } }, retry: () => {} }; };

beforeEach(() => { dukjil.value = null; window.localStorage.clear(); state.auth = { ready: true, authenticated: true, user: { id: "owner" } }; });

it("shows the first passport's name and tier while closed when nothing was chosen", () => {
  ready(creator("elina", "엘리나", true), creator("p1", "시험", true));
  render(<SelectedBiasChip locale="ko" />);
  const chip = screen.getByRole("button");
  expect(chip).toHaveAttribute("data-selected-bias", "selected");
  expect(chip).toHaveTextContent("엘리나");
  expect(chip).toHaveTextContent("실버");
  expect(chip).not.toHaveTextContent("최애 고르기");
});
it("shows the stored choice while its passport exists", () => {
  window.localStorage.setItem("kyaa:selected-bias:v1:owner", "p1");
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

const act = (count: number, remaining: number) => ({ count, points: 0, remaining, stamped: false });
const dukjilOn = (attendedToday: boolean, actions: Record<string, ReturnType<typeof act>>) => ({
  status: "on", refresh: () => {}, attendance: { attendedToday, streak: 1, nextBonusIn: 3 },
  catalog: { version: 3, missionBook: null, rules: { checkin: { points: 2 }, post: { points: 20, dailyLimit: 3 }, share: { points: 10, dailyLimit: 3 }, comment: { points: 3, dailyLimit: 10 }, invite: { points: 200 } } },
  today: { kstDate: "2026-11-07", policyActive: true, totalPoints: 0, actions, attendance: { attendedToday, streak: 1, nextBonusIn: 3 }, hasPassport: true },
});
it("reads tier · favorite · temperature: 3 of 4 daily missions is 75° (N17)", () => {
  ready(creator("elina", "엘리나", true));
  dukjil.value = dukjilOn(true, { post: act(3, 0), share: act(3, 0), comment: act(2, 8), invite: act(1, 0) });
  render(<SelectedBiasChip locale="ko" />);
  const chip = screen.getByRole("button");
  expect(chip.textContent).toMatch(/^실버.*엘리나.*75°$/);
  expect(chip.getAttribute("aria-label")).toMatch(/^내 최애 엘리나, 등급 실버.*, 온도 75도\. 눌러서 바꾸기$/);
});
it("draws no temperature slot while the 덕질 rules are off", () => {
  ready(creator("elina", "엘리나", true));
  dukjil.value = { ...dukjilOn(false, {}), status: "off" };
  render(<SelectedBiasChip locale="ko" />);
  expect(screen.getByRole("button").querySelector("[data-temperature]")).toBeNull();
  expect(screen.getByRole("button")).not.toHaveTextContent("°");
});
