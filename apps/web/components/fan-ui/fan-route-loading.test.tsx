import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FanRouteLoading } from "./fan-route-loading";

describe("FanRouteLoading", () => {
  it.each(["page", "overlay"] as const)("announces loading and hides the %s skeleton", (presentation) => {
    const { container } = render(<FanRouteLoading presentation={presentation} />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("페이지를 불러오는 중이에요.")).toBeInTheDocument();
    expect(container.querySelector('[aria-hidden="true"]')?.children).toHaveLength(5);
  });
});
