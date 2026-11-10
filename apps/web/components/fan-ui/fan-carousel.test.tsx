import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FanCarouselFrame, FanCarouselIndicator } from "./fan-carousel";

describe("shared fan carousel", () => {
  it("places previous and next beside the content, not inside it", () => {
    const previous = vi.fn(), next = vi.fn();
    const { container } = render(<FanCarouselFrame previous={{ label: "이전", onClick: previous }} next={{ label: "다음", onClick: next, disabled: true }}><p>내용</p></FanCarouselFrame>);
    const frame = container.querySelector("[data-fan-carousel-frame]")!;
    const [first, content, last] = Array.from(frame.children);
    expect(first).toBe(screen.getByRole("button", { name: "이전" }));
    expect(content).toContainElement(screen.getByText("내용"));
    expect(content.querySelector("button")).toBeNull();
    expect(last).toBe(screen.getByRole("button", { name: "다음" }));
    fireEvent.click(first);
    expect(previous).toHaveBeenCalledOnce();
    expect(last).toBeDisabled();
  });
  it("renders only the content when there is nothing to page", () => {
    const { container } = render(<FanCarouselFrame><p>하나</p></FanCarouselFrame>);
    expect(container.querySelector("[data-fan-carousel-frame]")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("marks one current segment and keeps extra controls in the same row", () => {
    const { container } = render(<FanCarouselIndicator count={4} current={2}><button type="button">정지</button></FanCarouselIndicator>);
    const segments = container.querySelectorAll("[aria-hidden] > span");
    expect(segments).toHaveLength(4);
    expect(Array.from(segments).map((segment) => segment.hasAttribute("data-current"))).toEqual([false, false, true, false]);
    expect(screen.getByRole("button", { name: "정지" }).parentElement).toBe(container.querySelector("[data-fan-carousel-indicator]"));
  });
});
