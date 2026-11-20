import { expect, it } from "vitest";
import { board, FPS, round, ROUND, verify, type Move } from "./engine";

it("replays three seeded layouts, including the mismatch hold and stage transitions", () => {
  const seed = 42;
  const sim = round("match", seed);
  const moves: Move[] = [];
  const tap = (index: number) => {
    for (let i = 0; i < 5; i++) sim.step();
    moves.push([sim.state.tick + 1, index]);
    sim.step(index);
  };
  tap(0);
  tap(sim.layout.findIndex(face => face !== sim.layout[0]));
  expect(sim.state.misses).toBe(1);
  expect(sim.state.second).toBeGreaterThan(-1);
  for (let i = 0; i < 36; i++) sim.step();
  for (let stage = 1; stage <= 3; stage++) {
    expect(sim.layout).toEqual(board(seed, "match", stage));
    expect(sim.state.stage).toBe(stage);
    for (let face = 0; face < 4; face++) {
      sim.layout.forEach((value, index) => { if (value === face) tap(index); });
    }
    if (stage < 3) for (let i = 0; i < 36; i++) sim.step();
  }
  const { tick, score } = sim.state;
  expect(sim.state).toMatchObject({ pairs: 12, misses: 1, done: true });
  expect(verify(seed,tick,moves,score,tick*1000/FPS)).toEqual(sim.state);
  expect(() => verify(seed,tick,moves,score+1,90000)).toThrow();
  expect(() => verify(seed,tick,moves,score,20)).toThrow();
});

it("ends a timed-out board without inventing solved pairs or accepting early submission", () => {
  const sim = round("match", 0);
  for (let i=0; i<ROUND; i++) sim.step();
  expect(verify(0,ROUND,[],0,60000)).toMatchObject({ done:true, score:0 });
  expect(() => verify(0,ROUND-1,[],0,60000)).toThrow();
  expect(() => verify(0,ROUND,[[1,0],[2,4]],0,60000)).toThrow();
  expect(() => verify(0,ROUND,[[1,8]],0,60000)).toThrow();
});
