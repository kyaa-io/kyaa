import { act } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("./stamp-press", () => ({ StampPress: () => <div data-testid="stamp" /> }));
import { celebrateStamp, playStampSlam } from "./stamp-slam";

const motion = (reduce: boolean) => vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: reduce, addEventListener: () => {}, removeEventListener: () => {} })));
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it("D3: lands one full-screen stamp that lets taps through, then clears and resolves (a second call joins the first)", async () => {
  motion(false);
  let first!: Promise<void>, second!: Promise<void>;
  await act(async () => { first = playStampSlam(); second = playStampSlam(); });
  expect(first).toBe(second);
  const layer = document.querySelector("[data-stamp-slam]")!;
  expect(layer).toHaveAttribute("aria-hidden", "true");
  expect(layer.querySelector("[data-testid=stamp]")).not.toBeNull();
  await act(async () => { vi.advanceTimersByTime(1700); });
  await first;
  expect(document.querySelector("[data-stamp-slam]")).toBeNull();
});
it("draws nothing with reduced motion and runs the reward right away", async () => {
  motion(true);
  const then = vi.fn();
  await celebrateStamp({ locale: "ko", points: 2, stamps: 1 }, then);
  expect(then).toHaveBeenCalledTimes(1);
  expect(document.querySelector("[data-stamp-slam]")).toBeNull();
});
it("runs the reward after the stamp, not before", async () => {
  motion(false);
  const then = vi.fn();
  let done!: Promise<void>;
  await act(async () => { done = celebrateStamp({ locale: "ko", points: 20, stamps: 1 }, then); });
  expect(then).not.toHaveBeenCalled();
  await act(async () => { vi.advanceTimersByTime(1700); });
  await done;
  expect(then).toHaveBeenCalledTimes(1);
});
