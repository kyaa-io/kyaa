import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { EarnBadge } from "./earn-badge";

it("names the points and the remaining count for screen readers, and draws only the amount (S4: no ×N)", () => {
  const { container } = render(<EarnBadge variant="inline" locale="ko" points={20} stamp remaining={2} />);
  expect(screen.getByText("포인트 20 적립, 오늘 2번 남음")).toBeInTheDocument();
  expect(container.textContent).not.toMatch(/×/);
  expect(screen.getByText(/도장/)).toBeInTheDocument();
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
  expect(container.querySelector('[data-earn-badge="corner"] img')).toHaveAttribute("src", "/images/economy/point-coin.svg");
  expect(screen.getByText("+20")).toBeInTheDocument();
  expect(container.textContent).not.toMatch(/×|\+20P/);
  expect(screen.getByText("포인트 20 적립")).toBeInTheDocument();
});
