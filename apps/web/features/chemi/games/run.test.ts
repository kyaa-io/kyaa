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

it("replays the Andong finish at 150 seconds using the map seed", async () => {
  const { ANDONG_COURSE } = await import("./content-course");
  const sim = runRound(0, ANDONG_COURSE);
  const { inputs } = play(0, 151 * FPS, sim);
  expect(sim.state.cleared).toBe(true);
  expect(sim.state.tick).toBe(150 * FPS);
  expect(verifyRun(99, sim.state.tick, inputs, sim.state.score, 150000, ANDONG_COURSE)).toEqual(sim.state);
});

it("joins checkpoint presses and rejects edits before the guest boundary", async () => {
  const { ANDONG_COURSE } = await import("./content-course");
  const { verifyGuestCheckpoint, verifyContinuedCourse } = await import("./content-course-replay");
  const sim = runRound(0, ANDONG_COURSE);
  const checkpoint = ANDONG_COURSE.sections[1].endTick;
  const { inputs } = play(0, checkpoint, sim);
  const prefix = { inputs, ticks: checkpoint, score: sim.state.score };
  expect(verifyGuestCheckpoint(prefix, 60000)).toEqual(sim.state);
  expect(() => verifyGuestCheckpoint({ ...prefix, score: prefix.score + 1 }, 60000)).toThrow();
  const rest = play(0, FPS * 150, sim);
  const suffix = { inputs: rest.inputs, ticks: sim.state.tick, score: sim.state.score };
  expect(verifyContinuedCourse(prefix, suffix, 150000)).toEqual(sim.state);
  expect(() => verifyContinuedCourse(prefix, { ...suffix, inputs: [[checkpoint, 1]] }, 150000)).toThrow();
});
