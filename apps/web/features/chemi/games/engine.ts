export const FPS = 60;
export const ROUND = FPS * 60;
export const STAGES = 3;
const REVEAL_TICKS = 36;
export type Move = [tick: number, card: number];

/** Four shuffled pairs around the fixed centre, in reading order. */
export function board(seed: number, game: "match", stage = 1) {
  const cards = [0, 1, 2, 3, 0, 1, 2, 3];
  let random = (seed ^ Math.imul(stage - 1, 0x9e3779b9)) >>> 0;
  for (let i = cards.length - 1; i > 0; i--) {
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
    const j = Math.floor(random / 4294967296 * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

export function round(game: "match", seed: number) {
  const layout = board(seed, game);
  const state = { tick: 0, stage: 1, misses: 0, pairs: 0, first: -1, second: -1, matched: 0, done: false, score: 0 };
  let revealUntil = 0;
  let lastTap = -6;

  function step(input?: number) {
    if (state.done) throw Error("ROUND_OVER");
    state.tick++;
    if (revealUntil && state.tick >= revealUntil) {
      if (state.matched === 255) {
        state.stage++;
        state.matched = 0;
        layout.splice(0, layout.length, ...board(seed, game, state.stage));
      }
      state.first = state.second = -1;
      revealUntil = 0;
    }
    if (input !== undefined && Number.isInteger(input) && input >= 0 && input < 8 &&
        !revealUntil && state.tick - lastTap >= 6 && !(state.matched & (1 << input)) && state.first !== input) {
      lastTap = state.tick;
      if (state.first === -1) {
        state.first = input;
      } else if (layout[state.first] === layout[input]) {
        state.matched |= (1 << state.first) | (1 << input);
        state.pairs++;
        state.first = -1;
        if (state.matched === 255) revealUntil = state.tick + REVEAL_TICKS;
      } else {
        state.second = input;
        state.misses++;
        revealUntil = state.tick + REVEAL_TICKS;
      }
    }
    state.done = state.tick === ROUND || state.pairs === STAGES * 4;
    // Most completed pairs first, then time with a one-second penalty per mistake.
    // One pair outweighs every possible time and mistake penalty in a round.
    state.score = state.pairs === 0 ? 0 : state.pairs * 20000 + ROUND - state.tick - state.misses * FPS;
  }
  return { layout, state, step };
}

export function verify(seed: number, ticks: number, moves: Move[], claimed: number, elapsedMs: number) {
  if (!Number.isInteger(ticks) || ticks < 1 || ticks > ROUND || !Number.isFinite(elapsedMs) ||
      ticks * 1000 / FPS > elapsedMs + 32 || moves.length > ticks) throw Error("INVALID_ROUND");
  let previous = -6;
  for (const [tick, card] of moves) {
    if (!Number.isInteger(tick) || tick < 1 || tick > ticks || tick - previous < 6 ||
        !Number.isInteger(card) || card < 0 || card > 7) throw Error("INVALID_MOVE");
    previous = tick;
  }
  const sim = round("match", seed);
  let next = 0;
  for (let tick = 1; tick <= ticks; tick++) {
    sim.step(moves[next]?.[0] === tick ? moves[next++][1] : undefined);
  }
  if (!sim.state.done || sim.state.score !== claimed) throw Error("INVALID_SCORE");
  return sim.state;
}
