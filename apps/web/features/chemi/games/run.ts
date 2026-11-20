import { FPS } from "./engine";

export const RUN_TICKS = FPS * 180;
const JUMP_TICKS = 42;
const INVINCIBLE_TICKS = 90;

export function runRound(seed: number) {
  const state = { tick: 0, score: 0, hearts: 3, height: 0, obstacle: 0, invincible: false, done: false };
  let random = seed >>> 0;
  let jump = -JUMP_TICKS;
  let hit = -INVINCIBLE_TICKS;
  let distance = 0;
  let next = 24;
  function step(pressed: boolean) {
    if (state.done) throw Error("RUN_OVER");
    state.tick++;
    if (pressed && state.tick - jump >= JUMP_TICKS) jump = state.tick;
    const phase = Math.min(1, (state.tick - jump) / JUMP_TICKS);
    state.height = 4 * phase * (1 - phase);
    const speed = Math.min(20, 8 + state.tick / 900);
    distance += speed / FPS;
    if (distance >= next) {
      if (state.height < 0.35 && state.tick - hit >= INVINCIBLE_TICKS) {
        state.hearts--;
        hit = state.tick;
      }
      random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
      next += 13 + random % 12;
    }
    state.obstacle = next - distance;
    state.score = Math.floor(distance);
    state.invincible = state.tick - hit < INVINCIBLE_TICKS;
    state.done = state.hearts === 0 || state.tick === RUN_TICKS;
  }
  return { state, step };
}

export function verifyRun(seed: number, ticks: number, jumps: number[], score: number, elapsed: number) {
  if (!Number.isInteger(ticks) || ticks < 1 || ticks > RUN_TICKS ||
      !Number.isFinite(elapsed) || ticks * 1000 / FPS > elapsed + 32 ||
      jumps.some((tick, i) => !Number.isInteger(tick) || tick < 1 || tick > ticks ||
        (i > 0 && tick - jumps[i - 1] < JUMP_TICKS))) throw Error("INVALID_RUN");
  const round = runRound(seed);
  let input = 0;
  while (round.state.tick < ticks) {
    const pressed = jumps[input] === round.state.tick + 1;
    if (pressed) input++;
    round.step(pressed);
  }
  if (!round.state.done || round.state.score !== score) throw Error("INVALID_RUN");
  return round.state;
}
