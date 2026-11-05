import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { EarnBadge } from "./earn-badge";

it("names the points for screen readers and shows the remaining count as returned", () => {
  render(<EarnBadge variant="inline" locale="ko" points={20} stamp remaining={2} />);
  expect(screen.getByText("포인트 20 적립")).toBeInTheDocument();
  expect(screen.getByText("×2")).toBeInTheDocument();
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
