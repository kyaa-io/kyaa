import { act, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PointRewardBurst, POINT_REWARD_MERGE_MS, usePointRewardBurst } from "./point-reward-burst";

const media = (reduced: boolean) => Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: (query: string) => ({ matches: reduced && query.includes("reduce"), media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }) });

describe("PointRewardBurst", () => {
  beforeEach(() => { vi.useFakeTimers(); media(false); });
  afterEach(() => vi.useRealTimers());

  it("announces the amount in the locale and shows +N P without blocking input", () => {
    render(<div><PointRewardBurst locale="ko" points={10} burstKey={1} /></div>);
    expect(screen.getByRole("status").textContent).toBe("포인트 10점을 받았어요");
    const burst = screen.getByTestId("point-reward-burst");
    expect(burst.textContent).toContain("+10 P");
    expect(burst.getAttribute("aria-hidden")).toBe("true");
  });

  it("renders the overlay in a body portal and can skip its own live region", () => {
    const { container } = render(<div style={{ overflow: "hidden" }}><PointRewardBurst locale="en" points={10} burstKey={1} announce={false} /></div>);
    expect(container.querySelector("[data-testid=point-reward-burst]")).toBeNull();
    expect(document.body.querySelector("[data-testid=point-reward-burst]")).not.toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("replaces the announcement node when the same amount repeats", () => {
    const { rerender } = render(<PointRewardBurst locale="en" points={10} burstKey={1} />);
    const first = screen.getByRole("status").firstElementChild;
    rerender(<PointRewardBurst locale="en" points={10} burstKey={2} />);
    expect(screen.getByRole("status").firstElementChild).not.toBe(first);
  });

  it("hides after the animation and keeps the live region mounted", () => {
    render(<PointRewardBurst locale="en" points={30} burstKey={1} />);
    act(() => { vi.advanceTimersByTime(1600); });
    expect(screen.queryByTestId("point-reward-burst")).toBeNull();
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("renders nothing for zero points", () => {
    render(<PointRewardBurst locale="en" points={0} />);
    expect(screen.queryByTestId("point-reward-burst")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("uses a static display without particles under reduced motion", () => {
    media(true);
    render(<PointRewardBurst locale="en" points={10} burstKey={1} />);
    const burst = screen.getByTestId("point-reward-burst");
    expect(burst.getAttribute("data-reduced")).toBe("true");
    expect(burst.querySelectorAll("[class*=particle]").length).toBe(0);
    act(() => { vi.advanceTimersByTime(1600); });
    expect(screen.queryByTestId("point-reward-burst")).not.toBeNull();
  });

  it("merges grants inside the window and starts a new total after it", () => {
    const { result } = renderHook(() => usePointRewardBurst());
    act(() => { result.current.add(10); });
    act(() => { vi.advanceTimersByTime(300); result.current.add(10); });
    expect(result.current.burst).toEqual({ points: 20, key: 2 });
    act(() => { vi.advanceTimersByTime(POINT_REWARD_MERGE_MS + 100); result.current.add(30); });
    expect(result.current.burst).toEqual({ points: 30, key: 3 });
    act(() => { result.current.add(0); result.current.add(-5); });
    expect(result.current.burst?.points).toBe(30);
  });
});
