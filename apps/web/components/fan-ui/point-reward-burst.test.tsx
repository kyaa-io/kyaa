import { act, render, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { registerFanToastHandler } from "./fan-toast";
const shown: unknown[] = [];
registerFanToastHandler({ show: options => { shown.push(options); return `t${shown.length}`; }, close: () => undefined });
import { PointRewardBurst, POINT_REWARD_MERGE_MS, usePointRewardBurst } from "./point-reward-burst";
import { resetRewardCelebration } from "./reward-celebration";

const media = (reduced: boolean) => Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: (query: string) => ({ matches: reduced && query.includes("reduce"), media: query, addEventListener() {}, removeEventListener() {} }) });

describe("PointRewardBurst (261107-2 D8: the shared reward celebration)", () => {
  beforeEach(() => { vi.useFakeTimers(); media(false); shown.length = 0; resetRewardCelebration(); document.body.innerHTML = ""; });
  afterEach(() => vi.useRealTimers());

  it("pops the shared coin badge in the body and shows the shared toast with the amount", () => {
    render(<div style={{ overflow: "hidden" }}><PointRewardBurst locale="ko" points={10} burstKey={1} /></div>);
    const badge = document.body.querySelector("[data-testid=point-reward-burst]")!;
    expect(badge.textContent).toBe("+10");
    expect(badge.getAttribute("aria-hidden")).toBe("true");
    expect(shown).toEqual([{ title: "+10P", description: undefined, tone: "success" }]);
  });

  it("names stamps beside points", () => {
    render(<PointRewardBurst locale="ko" points={20} stamps={1} label="글쓰기 미션 완료" burstKey={1} />);
    expect(shown.at(-1)).toMatchObject({ title: "+20P · 도장 1", description: "글쓰기 미션 완료" });
  });

  it("takes the hook's merged total as it is instead of adding it again", () => {
    const { rerender } = render(<PointRewardBurst locale="en" points={10} burstKey={1} />);
    rerender(<PointRewardBurst locale="en" points={20} burstKey={2} />);
    expect(shown.at(-1)).toMatchObject({ title: "+20P" });
    expect(document.body.querySelectorAll("[data-testid=point-reward-burst]")).toHaveLength(1);
  });

  it("removes the badge after its moment and calls onDone", () => {
    const onDone = vi.fn();
    render(<PointRewardBurst locale="en" points={30} burstKey={1} onDone={onDone} />);
    act(() => { vi.advanceTimersByTime(1600); });
    expect(document.body.querySelector("[data-testid=point-reward-burst]")).toBeNull();
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("does nothing for zero points", () => {
    render(<PointRewardBurst locale="en" points={0} />);
    expect(document.body.querySelector("[data-testid=point-reward-burst]")).toBeNull();
    expect(shown).toHaveLength(0);
  });

  it("holds the badge still and longer under reduced motion", () => {
    media(true);
    render(<PointRewardBurst locale="en" points={10} burstKey={1} />);
    expect(document.body.querySelector("[data-testid=point-reward-burst]")!.hasAttribute("data-reduced")).toBe(true);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(document.body.querySelector("[data-testid=point-reward-burst]")).not.toBeNull();
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
