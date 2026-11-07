// @vitest-environment jsdom
import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FanRewardPop, FanRouteTransition } from "./fan-motion";

let pathname = "/a";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
afterEach(() => { vi.unstubAllGlobals(); pathname = "/a"; });

describe("FanRewardPop", () => {
  it("does not animate on first mount and loads Motion only after the trigger changes, once", async () => {
    const { container, rerender } = render(<FanRewardPop trigger="open"><span>배지</span></FanRewardPop>);
    expect(container.querySelector("[data-fan-motion]")).toBeNull();
    expect(container.textContent).toBe("배지");
    rerender(<FanRewardPop trigger="done"><span>완료</span></FanRewardPop>);
    await waitFor(() => expect(container.querySelector("[data-fan-motion='complete']")).not.toBeNull());
    expect(container.textContent).toBe("완료");
    rerender(<FanRewardPop trigger="done"><span>완료</span></FanRewardPop>);
    expect(container.querySelectorAll("[data-fan-motion]")).toHaveLength(1);
  });
});

describe("FanRouteTransition", () => {
  it("animates the same element on a path change without remounting, and not under reduced motion", () => {
    const animate = vi.fn(() => ({ cancel: vi.fn() }));
    Object.defineProperty(HTMLElement.prototype, "animate", { value: animate, configurable: true });
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    const { container, rerender } = render(<FanRouteTransition><input defaultValue="x" /></FanRouteTransition>);
    const node = container.firstElementChild;
    expect(animate).not.toHaveBeenCalled();
    pathname = "/b";
    rerender(<FanRouteTransition><input defaultValue="x" /></FanRouteTransition>);
    expect(animate).toHaveBeenCalledOnce();
    expect(container.firstElementChild).toBe(node);
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    pathname = "/c";
    rerender(<FanRouteTransition><input defaultValue="x" /></FanRouteTransition>);
    expect(animate).toHaveBeenCalledOnce();
  });
});
