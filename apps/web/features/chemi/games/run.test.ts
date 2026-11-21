import { expect, it } from "vitest";
import { FPS } from "./engine";
import { runRound, verifyRun } from "./run";
import { play } from "./run-bot";

it("ends a run with no presses and replays to the same score", () => {
  const sim = runRound(100);
  while (!sim.state.done) sim.step();
  const { tick, score } = sim.state;
  expect(sim.state.hearts === 0 || sim.state.fell).toBe(true);
  expect(verifyRun(100, tick, [], score, 600000)).toEqual(sim.state);
  expect(() => verifyRun(100, tick, [], score + 1, 600000)).toThrow();
  expect(() => verifyRun(100, tick, [], score, 1)).toThrow();
  expect(() => verifyRun(100, tick + 1, [], score, 600000)).toThrow();
});

it("lets every course be cleared for two minutes by following the legend", () => {
  for (let seed = 1; seed <= 40; seed++) {
    const { sim } = play(seed * 7919, FPS * 120);
    expect([seed, sim.state.tick, sim.state.fell], `seed ${seed}`).toEqual([seed, FPS * 120, false]);
    expect(sim.state.hearts).toBeGreaterThan(0);
  }
});

it("verifies a played run, a run the player left early, and rejects edited presses", () => {
  const { sim, inputs } = play(4242, FPS * 45);
  const { tick, score } = sim.state;
  expect(score).toBeGreaterThan(4000);
  expect(sim.state.fevers).toBeGreaterThan(0);
  expect(verifyRun(4242, tick, inputs, score, 60000).score).toBe(score);
  expect(() => verifyRun(4242, tick, inputs.slice(1), score, 60000)).toThrow();
  expect(() => verifyRun(4242, tick, [[5, 8]], score, 60000)).toThrow();
});
