// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SourceStatePanel } from "./source-state-panel";

describe("SourceStatePanel fill", () => {
  it("marks the panel only when it should end on its column's edges", () => {
    const { rerender } = render(<SourceStatePanel title="state" role="status" />);
    expect(screen.getByRole("status")).not.toHaveAttribute("data-fill");
    rerender(<SourceStatePanel title="state" role="status" fill />);
    expect(screen.getByRole("status")).toHaveAttribute("data-fill");
  });
});
