import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RollingNumber } from "./rolling-number";

type Animate = (keyframes: Keyframe[], options: KeyframeAnimationOptions) => Animation;
const animate = vi.fn<Animate>(() => ({ cancel: vi.fn() }) as unknown as Animation);
const wheels = (container: HTMLElement) => container.querySelectorAll("[aria-hidden] > span > span");

afterEach(() => { animate.mockReset(); delete (HTMLElement.prototype as { animate?: unknown }).animate; });

describe("RollingNumber", () => {
  it("shows the first value at once and names it for screen readers", () => {
    (HTMLElement.prototype as { animate?: unknown }).animate = animate;
    render(<RollingNumber value={1260} />);
    expect(screen.getByRole("img", { name: "1,260" })).toBeInTheDocument();
    expect(animate).not.toHaveBeenCalled();
  });

  it("rolls only the changed places, up when the value grows", () => {
    (HTMLElement.prototype as { animate?: unknown }).animate = animate;
    const { container, rerender } = render(<RollingNumber value={17} />);
    rerender(<RollingNumber value={18} />);
    expect(screen.getByRole("img", { name: "18" })).toBeInTheDocument();
    expect(animate).toHaveBeenCalledTimes(1);
    const [frames, options] = animate.mock.calls[0]!;
    expect(frames[0]!.transform).toBe("translateY(0)");
    expect(frames[1]!.transform).toBe("translateY(-50%)");
    expect(options.duration).toBeGreaterThanOrEqual(400);
    expect(options.duration).toBeLessThanOrEqual(700);
    expect(container.textContent).toContain("78");
  });

  it("a list can slow the roll and delay it: duration, easing and the row's delay come through", () => {
    (HTMLElement.prototype as { animate?: unknown }).animate = animate;
    const { rerender } = render(<RollingNumber value={17} duration={850} easing="ease-out" delay={180} />);
    rerender(<RollingNumber value={18} duration={850} easing="ease-out" delay={180} />);
    const [, options] = animate.mock.calls[0]!;
    expect(options).toMatchObject({ duration: 850, easing: "ease-out", delay: 180 });
  });

  it("rolls down when the value shrinks and passes through the carry", () => {
    (HTMLElement.prototype as { animate?: unknown }).animate = animate;
    const { rerender } = render(<RollingNumber value={100} />);
    rerender(<RollingNumber value={99} />);
    expect(animate).toHaveBeenCalledTimes(2);
    for (const [frames] of animate.mock.calls) expect(frames[1]!.transform).toBe("translateY(0)");
  });

  it("changes at once under reduced motion", () => {
    (HTMLElement.prototype as { animate?: unknown }).animate = animate;
    vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    const { rerender } = render(<RollingNumber value={7} />);
    rerender(<RollingNumber value={8} />);
    expect(animate).not.toHaveBeenCalled();
    expect(screen.getByRole("img", { name: "8" })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("does not animate a place that appears with a longer number", () => {
    (HTMLElement.prototype as { animate?: unknown }).animate = animate;
    const { rerender } = render(<RollingNumber value={9} />);
    rerender(<RollingNumber value={10} />);
    expect(animate).toHaveBeenCalledTimes(1);
    expect(wheels(document.body).length).toBeGreaterThan(0);
  });
});
