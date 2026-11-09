import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FanSectionLink } from "./fan-section-link";

describe("FanSectionLink", () => {
  it("is a text link whose › is a hidden glyph, with no icon, border or pill", () => {
    const { container } = render(<FanSectionLink href="/live">전체 LIVE</FanSectionLink>);
    const link = screen.getByRole("link", { name: "전체 LIVE" });
    expect(link).toHaveAttribute("href", "/live");
    expect(link.textContent).toBe("전체 LIVE›");
    expect(container.querySelector("svg")).toBeNull();
    expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBe("›");
  });
});
