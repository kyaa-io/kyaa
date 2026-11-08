import { expect, it } from "vitest";
import { registrationRewardPoints } from "./registration-reward";
it("reads only a positive integer reward", () => {
  expect(registrationRewardPoints({ id: "x", reward: { points: 30 } })).toBe(30);
  for (const value of [null, true, {}, { id: "x" }, { reward: {} }, { reward: { points: 0 } }, { reward: { points: -3 } }, { reward: { points: 1.5 } }, { reward: { points: "30" } }]) expect(registrationRewardPoints(value)).toBeUndefined();
});

it("reads the shared reward shape and plays nothing for a declined grant (review r4)", () => {
  expect(registrationRewardPoints({ reward: { points: 20, stamps: 1 } })).toBe(20);
  expect(registrationRewardPoints({ reward: { points: 0, stamps: 0, skippedReason: "daily_cap" } })).toBeUndefined();
});
