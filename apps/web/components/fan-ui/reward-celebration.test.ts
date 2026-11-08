import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { registerFanToastHandler } from "./fan-toast";
const toast = { shown: [] as unknown[], closed: [] as unknown[] };
registerFanToastHandler({ show: options => { toast.shown.push(options); return `t${toast.shown.length}`; }, close: id => { toast.closed.push(id); } });
import { celebrateReward, resetRewardCelebration, rewardSummary, REWARD_MERGE_MS } from "./reward-celebration";

beforeEach(() => { vi.useFakeTimers(); toast.shown.length = 0; toast.closed.length = 0; resetRewardCelebration(); document.body.innerHTML = ""; });
afterEach(() => vi.useRealTimers());

it("writes the grant in each language without multiplication signs", () => {
  expect(rewardSummary("ko", 20, 1)).toBe("+20P · 스탬프 1");
  expect(rewardSummary("en", 1200, 2)).toBe("+1,200P · 2 stamps");
  expect(rewardSummary("en", 0, 1)).toBe("1 stamp");
  expect(rewardSummary("ja", 20, 0)).toBe("+20P");
  expect(rewardSummary("ko", 0, 0)).toBe("");
});

it("raises the coin badge from the pressed element and adds close grants into one toast", () => {
  const button = document.createElement("button");
  button.getBoundingClientRect = () => ({ left: 100, top: 300, width: 80, height: 44, right: 180, bottom: 344, x: 100, y: 300, toJSON() {} });
  document.body.append(button);
  celebrateReward({ locale: "ko", points: 3, anchor: button });
  const badge = document.querySelector<HTMLElement>("[data-reward-badge]")!;
  expect([badge.style.left, badge.style.top, badge.textContent]).toEqual(["140px", "300px", "+3"]);
  vi.advanceTimersByTime(REWARD_MERGE_MS - 200);
  celebrateReward({ locale: "ko", points: 1, stamps: 1 });
  expect(toast.closed).toEqual(["t1"]);
  expect(toast.shown.at(-1)).toMatchObject({ title: "+4P · 스탬프 1", tone: "success" });
  expect(document.querySelectorAll("[data-reward-badge]")).toHaveLength(1);
  vi.advanceTimersByTime(REWARD_MERGE_MS + 100);
  celebrateReward({ locale: "ko", points: 20 });
  expect(toast.shown.at(-1)).toMatchObject({ title: "+20P" });
});

it("shows a stamp-only grant in words and ignores empty or invalid grants", () => {
  celebrateReward({ locale: "ko", stamps: 1 });
  expect(document.querySelector("[data-reward-badge]")!.textContent).toBe("스탬프 1");
  expect(document.querySelector("[data-reward-badge] img")).toBeNull();
  celebrateReward({ locale: "ko", points: Number.NaN });
  celebrateReward({ locale: "ko", points: -5 });
  expect(toast.shown).toHaveLength(1);
});
