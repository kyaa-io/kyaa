import { act } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("./stamp-press", () => ({ StampPress: () => <div data-testid="stamp" /> }));
const reward = vi.hoisted(() => ({ calls: [] as unknown[] }));
vi.mock("@/components/fan-ui/reward-celebration", () => ({ celebrateReward: (options: unknown) => { reward.calls.push(options); } }));
import { celebrateStamp, playStampSlam } from "./stamp-slam";

const motion = (reduce: boolean) => vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: reduce, addEventListener: () => {}, removeEventListener: () => {} })));
beforeEach(() => { vi.useFakeTimers(); reward.calls = []; });
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
it("draws nothing with reduced motion and runs the shared reward (D8) right away", async () => {
  motion(true);
  await celebrateStamp({ locale: "ko", points: 2, stamps: 1 });
  expect(reward.calls).toEqual([{ locale: "ko", points: 2, stamps: 1, anchor: undefined, label: undefined }]);
  expect(document.querySelector("[data-stamp-slam]")).toBeNull();
});
it("shows the confirmed reward before the animation finishes; a stamp-only grant still says one stamp", async () => {
  motion(false);
  let done!: Promise<void>;
  await act(async () => { done = celebrateStamp({ locale: "ko", label: "퀴즈 통과" }); });
  expect(reward.calls).toHaveLength(1);
  await act(async () => { vi.advanceTimersByTime(1700); });
  await done;
  expect(reward.calls).toEqual([{ locale: "ko", points: 0, stamps: 1, anchor: undefined, label: "퀴즈 통과" }]);
});
