export const FPS = 60;
export const LEVELS = [
  { columns: 3, pairs: 4, seconds: 30 },
  { columns: 3, pairs: 6, seconds: 45 },
  { columns: 4, pairs: 8, seconds: 60 },
  { columns: 4, pairs: 10, seconds: 80 },
  { columns: 5, pairs: 15, seconds: 110 },
] as const;
export const ROUND = LEVELS.reduce((sum, level) => sum + level.seconds * FPS, 0);
const REVEAL_TICKS = FPS * 0.75;
export type Move = [tick: number, card: number];

/** The fixed bonus cell is rendered separately from the shuffled pairs. */
export function board(seed: number, game: "match", stage = 1) {
  const faces = Array.from({ length: LEVELS[stage - 1].pairs }, (_, i) => i);
  const cards = [...faces, ...faces];
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
  const state = { tick: 0, stage: 1, misses: 0, pairs: 0, clearPoints: 0, timePoints: 0, accuracyPoints: 0, stagePairs: 0, attempts: 0, remaining: LEVELS[0].seconds * FPS, cleared: false, first: -1, second: -1, matched: 0, done: false, score: 0 };
  let revealUntil = 0;
  let lastTap = -6;

  function step(input?: number) {
    if (state.done) throw Error("ROUND_OVER");
    state.tick++;
    if (state.cleared) {
      state.stage++;
      state.stagePairs = state.attempts = state.matched = 0;
      state.remaining = LEVELS[state.stage - 1].seconds * FPS;
      state.cleared = false;
      layout.splice(0, layout.length, ...board(seed, game, state.stage));
    }
    state.remaining--;
    if (revealUntil && state.tick >= revealUntil) {
      state.first = state.second = -1;
      revealUntil = 0;
    }
    if (input !== undefined && Number.isInteger(input) && input >= 0 && input < layout.length &&
        !revealUntil && state.tick - lastTap >= 6 && !(state.matched & (1 << input)) && state.first !== input) {
      lastTap = state.tick;
      if (state.first === -1) {
        state.first = input;
      } else if (layout[state.first] === layout[input]) {
        state.matched |= (1 << state.first) | (1 << input);
        state.pairs++;
        state.stagePairs++;
        state.attempts++;
        state.score += 100;
        state.first = -1;

      } else {
        state.second = input;
        state.misses++;
        state.attempts++;
        revealUntil = state.tick + REVEAL_TICKS;
      }
    }
    state.cleared = state.stagePairs === LEVELS[state.stage - 1].pairs;
    state.done = (!state.cleared && state.remaining === 0) || (state.cleared && state.stage === LEVELS.length);
    if (state.cleared || state.done) {
      state.accuracyPoints += Math.floor(state.stagePairs ** 2 * 100 / Math.max(1, state.attempts));
      if (state.cleared) {
        state.clearPoints += 500;
        state.timePoints += Math.floor(state.remaining / FPS) * 10;
      }
      state.score = state.pairs * 100 + state.clearPoints + state.timePoints + state.accuracyPoints;
    }
  }
  return { layout, state, step };
}

export function verify(seed: number, ticks: number, moves: Move[], claimed: number, elapsedMs: number) {
  if (!Number.isInteger(ticks) || ticks < 1 || ticks > ROUND || !Number.isFinite(elapsedMs) ||
      ticks * 1000 / FPS > elapsedMs + 32 || moves.length > ticks) throw Error("INVALID_ROUND");
  let previous = -6;
  for (const [tick, card] of moves) {
    if (!Number.isInteger(tick) || tick < 1 || tick > ticks || tick - previous < 6 ||
        !Number.isInteger(card) || card < 0 || card >= 30) throw Error("INVALID_MOVE");
    previous = tick;
  }
  const sim = round("match", seed);
  let next = 0;
  for (let tick = 1; tick <= ticks; tick++) {
    const input = moves[next]?.[0] === tick ? moves[next++][1] : undefined;
    if (input !== undefined && input >= sim.layout.length) throw Error("INVALID_MOVE");
    sim.step(input);
  }
  if ((!sim.state.done && !sim.state.cleared) || sim.state.score !== claimed) throw Error("INVALID_SCORE");
  return sim.state;
}
