import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { EarnBadge, EarnRemaining } from "./earn-badge";
import { capPeriod, missionProgress } from "../domain/dukjil-ui";
import type { DukjilCatalogView, DukjilTodayView } from "../domain/dukjil-ui";

it("names the points and the remaining count for screen readers, and draws only the amount (S4: no ×N)", () => {
  const { container } = render(<EarnBadge variant="inline" locale="ko" points={20} stamp remaining={2} />);
  expect(screen.getByText("포인트 20 적립, 오늘 2번 남음")).toBeInTheDocument();
  expect(container.textContent).not.toMatch(/×/);
  expect(screen.getByText(/스탬프/)).toBeInTheDocument();
});
it("done badge carries text, not colour only, and no remaining count", () => {
  const { container } = render(<EarnBadge variant="done" locale="ko" />);
  expect(screen.getByText("오늘 완료")).toBeInTheDocument();
  expect(container.textContent).not.toMatch(/×/);
});
it("icon variant hides the glyph from assistive tech but keeps the label", () => {
  render(<EarnBadge variant="icon" locale="en" points={3} />);
  expect(screen.getByText("P")).toHaveAttribute("aria-hidden", "true");
  expect(screen.getByText(/3/)).toBeInTheDocument();
});
it("corner variant shows the coin and +points without the P suffix or a remaining count", () => {
  const { container } = render(<EarnBadge variant="corner" locale="ko" points={20} remaining={3} />);
  expect(container.querySelector('[data-earn-badge="corner"] img')).toHaveAttribute("src", "/images/economy/point-coin.webp");
  expect(screen.getByText("+20")).toBeInTheDocument();
  expect(container.textContent).not.toMatch(/×|\+20P/);
  expect(screen.getByText("포인트 20 적립")).toBeInTheDocument();
});
it("a monthly cap says this month, never today", () => {
  render(<EarnBadge variant="inline" locale="ko" points={100} remaining={2} remainingPer="month" />);
  expect(screen.getByText("포인트 100 적립, 이번 달 2회 남음")).toBeInTheDocument();
  expect(screen.queryByText(/오늘/)).toBeNull();
});
it("EarnRemaining names the month for a monthly cap in ko and en", () => {
  const { container, rerender } = render(<EarnRemaining locale="ko" remaining={4} per="month" />);
  expect(container.textContent).toBe("이번 달 4회 남음");
  rerender(<EarnRemaining locale="en" remaining={4} per="month" />);
  expect(container.textContent).toBe("4 left this month");
  rerender(<EarnRemaining locale="ko" remaining={4} />);
  expect(container.textContent).toBe("오늘 4번 남음");
});
it("reads the window from the policy cap: user_month and creator_month are monthly, user_day and none are daily", () => {
  expect(capPeriod({ pointCap: { per: "user_month", max: 5 } })).toBe("month");
  expect(capPeriod({ pointCap: { per: "creator_month", max: 2 } })).toBe("month");
  expect(capPeriod({ pointCap: { per: "user_day", max: 3 } })).toBe("day");
  expect(capPeriod({})).toBe("day");
  expect(capPeriod(undefined)).toBe("day");
  const catalog = { rules: { invite: { points: 200, pointCap: { per: "user_month", max: 5 } }, proof: { points: 100, pointCap: { per: "creator_month", max: 2 } }, post: { points: 20, pointCap: { per: "user_day", max: 3 } } } } as unknown as DukjilCatalogView;
  const today = { kstDate: "2026-11-09", policyActive: true, totalPoints: 0, hasPassport: true, attendance: null, actions: { invite: { count: 1, points: 0, remaining: 4, stamped: false }, proof: { count: 0, points: 0, remaining: 2, stamped: false }, post: { count: 0, points: 0, remaining: 3, stamped: false } } } as unknown as DukjilTodayView;
  expect(missionProgress(catalog, today, "invite")).toMatchObject({ remaining: 4, period: "month" });
  expect(missionProgress(catalog, today, "proof")).toMatchObject({ remaining: 2, period: "month" });
  expect(missionProgress(catalog, today, "post")).toMatchObject({ remaining: 3, period: "day" });
});
