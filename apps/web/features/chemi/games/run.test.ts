import { expect, it } from "vitest";
import { runRound, verifyRun } from "./run";

it("verifies the distance when all three hearts are lost", () => {
  const sim = runRound(100);
  while (!sim.state.done) sim.step(false);
  const { tick, score, hearts } = sim.state;
  expect(hearts).toBe(0);
  expect(verifyRun(100, tick, [], score, 180000)).toEqual(sim.state);
  expect(() => verifyRun(100, tick, [], score + 1, 180000)).toThrow();
  expect(() => verifyRun(100, tick, [], score, 1)).toThrow();
});
