import { FPS } from "./engine";

/**
 * Side-view auto runner. One world unit is one art pixel ("cell"); the screen scales cells by a
 * whole number. The browser and the server run this same code at 60 steps a second, so a score
 * is whatever the recorded presses replay to.
 */
export const RUN_TICKS = FPS * 600;
export const RUN_TITLES = [4000, 10000, 18000] as const;
export const FEVER_NOTES = 20;
export const FEVER_TICKS = FPS * 7;
export const RUN_INPUT = { jump: 1, slideDown: 2, slideUp: 4 } as const;
export const PLAYER = { left: 26, right: 40, stand: 42, slide: 18 } as const;

const GRAVITY = 950;
const JUMP_SPEED = 360;
const SECOND_JUMP_SPEED = 330;
const FAST_FALL = 420;
const COYOTE_TICKS = 6;
const SLIDE_MIN_TICKS = 33;
const INVINCIBLE_TICKS = FPS;
const BOOST_TICKS = FPS * 3;
const SPAWN_AHEAD = 460;
const FALL_OUT = -48;
const MIN_INTERVAL = 0.7;
const CELLS_PER_METER = 5;

export type RunKind = "cone" | "barricade" | "crates" | "bar" | "lantern" | "pit" | "note" | "heart" | "shield" | "boost";
export type RunEntity = { id: number; kind: RunKind; x: number; y: number; w: number; h: number; gone: boolean; passed: boolean };
export type RunEvent =
  | { type: "jump" | "double" | "slide" | "hit" | "block" | "smash" | "fall" | "fever" | "feverEnd" | "heart" | "shield" | "boost" }
  | { type: "note" | "dodge"; points: number; x: number; y: number }
  | { type: "combo"; count: number };
export type RunInput = [tick: number, mask: number];

const SHAPES: Record<Exclude<RunKind, "pit">, readonly [w: number, h: number, y: number]> = {
  cone: [12, 16, 0],
  barricade: [22, 22, 0],
  crates: [26, 54, 0],
  bar: [72, 26, 32],
  lantern: [14, 22, 32],
  note: [8, 10, 0],
  heart: [12, 11, 0],
  shield: [12, 13, 0],
  boost: [12, 12, 0],
};
const SOLID = new Set<RunKind>(["cone", "barricade", "crates", "bar", "lantern"]);

export function runRound(seed: number) {
  const state = {
    tick: 0, distance: 0, score: 0, meters: 0, level: 1, speed: 160, hearts: 3,
    height: 0, velocity: 0, airJumps: 0, grounded: true, sliding: false,
    invincible: false, shield: false, boost: 0, fever: 0, feverNotes: 0,
    notes: 0, combo: 0, bestCombo: 0, fevers: 0, done: false, fell: false,
  };
  const entities: RunEntity[] = [];
  const events: RunEvent[] = [];
  let random = seed >>> 0;
  let points = 0;
  let nextId = 0;
  let cursor = 480;
  let patterns = 0;
  let last = -1;
  let repeats = 0;
  let slideHeld = false;
  let slideUntil = 0;
  let airborneSince = 0;
  let hitUntil = 0;
  let nextHeart = FPS * 45;
  let nextShield = FPS * 30;
  let nextBoost = FPS * 25;

  function roll(count: number) {
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
    return Math.floor(random / 4294967296 * count);
  }
  function add(kind: RunKind, x: number, y = 0, w = 0) {
    const shape = kind === "pit" ? ([w, 0, 0] as const) : SHAPES[kind];
    entities.push({ id: nextId++, kind, x, y: y + shape[2], w: shape[0], h: shape[1], gone: false, passed: false });
  }
  function notes(x: number, heights: readonly number[], step = 14) {
    heights.forEach((y, i) => add("note", x + i * step, y));
  }
  /** Lays one pattern at `x` and returns its length. Every pattern has been cleared by the test bot. */
  function pattern(kind: number, x: number): number {
    switch (kind) {
      case 0: add("cone", x); add("cone", x + 30); notes(x - 2, [36, 44, 36], 18); return 42;
      case 1: add("barricade", x); notes(x - 8, [38, 46, 38], 18); return 22;
      case 2: add("pit", x, 0, 56); notes(x + 6, [48, 58, 48], 18); return 56;
      case 3: add("bar", x); notes(x + 16, [4, 4, 4], 18); return 72;
      case 4: add("cone", x); add("crates", x + 44); notes(x + 34, [78, 88, 78], 18); return 70;
      case 5: add("lantern", x); notes(x - 20, [4, 4], 18); return 16;
      case 6: {
        const run = Math.floor(state.speed * 0.7);
        add("bar", x); notes(x + 16, [4, 4, 4], 18); add("crates", x + 72 + run); notes(x + 62 + run, [78, 88, 78], 18);
        return 98 + run;
      }
      default: add("barricade", x); add("pit", x + 34, 0, 56); notes(x + 20, [46, 60, 60, 46], 18); return 90;
    }
  }
  function spawn() {
    while (cursor < state.distance + SPAWN_AHEAD) {
      const kinds = state.level === 1 ? 4 : state.level === 2 ? 6 : 8;
      let kind = patterns < 3 ? [0, 1, 2][patterns] : roll(kinds);
      if (kind === last && repeats >= 2) kind = (kind + 1) % kinds;
      repeats = kind === last ? repeats + 1 : 1;
      last = kind;
      patterns++;
      const length = pattern(kind, cursor);
      const interval = Math.max(MIN_INTERVAL, 1.05 - 0.05 * (state.level - 1));
      const gap = state.speed * interval;
      const middle = cursor + length + gap / 2;
      if (state.tick >= nextHeart && state.hearts < 3) { add("heart", middle, 30); nextHeart = state.tick + FPS * 45; }
      else if (state.tick >= nextShield && !state.shield) { add("shield", middle, 30); nextShield = state.tick + FPS * 30; }
      else if (state.tick >= nextBoost) { add("boost", middle, 30); nextBoost = state.tick + FPS * 25; }
      cursor += length + gap;
    }
  }
  function gain(amount: number) {
    const earned = amount * (state.fever || state.boost ? 2 : 1);
    points += earned;
    return earned;
  }

  function step(mask = 0) {
    if (state.done) throw Error("RUN_OVER");
    events.length = 0;
    const tick = ++state.tick;
    state.level = 1 + Math.floor(tick / (FPS * 12));
    state.speed = Math.min(310, 160 + 2.5 * tick / FPS) * (state.boost ? 1.5 : 1);
    const moved = state.speed / FPS;
    state.distance += moved;
    points += moved / CELLS_PER_METER * (state.fever || state.boost ? 2 : 1);
    spawn();

    if (mask & RUN_INPUT.slideDown) slideHeld = true;
    if (mask & RUN_INPUT.slideUp) slideHeld = false;
    const center = state.distance + (PLAYER.left + PLAYER.right) / 2;
    // A boost carries the runner over pits as well as through obstacles.
    const overPit = !state.boost && entities.some((e) => e.kind === "pit" && center > e.x && center < e.x + e.w);
    if (state.grounded && overPit) { state.grounded = false; airborneSince = tick; state.velocity = 0; }
    if (mask & RUN_INPUT.jump) {
      const coyote = !state.grounded && state.airJumps === 0 && state.height <= 0 && state.velocity <= 0 && tick - airborneSince <= COYOTE_TICKS;
      if (state.grounded || coyote) {
        state.grounded = false; state.velocity = JUMP_SPEED; state.height = Math.max(0, state.height);
        state.airJumps = 0; airborneSince = tick - COYOTE_TICKS - 1; slideUntil = 0; events.push({ type: "jump" });
      } else if (state.airJumps === 0 && state.height > FALL_OUT / 2) {
        state.airJumps = 1; state.velocity = SECOND_JUMP_SPEED; events.push({ type: "double" });
      }
    }
    if (!state.grounded && (mask & RUN_INPUT.slideDown) && state.velocity > -FAST_FALL) state.velocity = -FAST_FALL;
    if (!state.grounded) {
      const above = state.height >= 0;
      state.velocity -= GRAVITY / FPS;
      state.height += state.velocity / FPS;
      if (above && state.height <= 0 && !overPit) {
        state.height = 0; state.velocity = 0; state.grounded = true; state.airJumps = 0;
      }
    }
    if (state.grounded && (mask & RUN_INPUT.slideDown)) { slideUntil = tick + SLIDE_MIN_TICKS; events.push({ type: "slide" }); }
    if (state.grounded && slideHeld && tick >= slideUntil) slideUntil = tick + 1;
    state.sliding = state.grounded && tick < slideUntil;

    const left = state.distance + PLAYER.left;
    const right = state.distance + PLAYER.right;
    const top = state.height + (state.sliding ? PLAYER.slide : PLAYER.stand);
    for (const e of entities) {
      if (e.gone || e.kind === "pit") {
        if (e.kind === "pit" && !e.passed && e.x + e.w < left && state.height >= 0) { e.passed = true; dodge(e); }
        continue;
      }
      const solid = SOLID.has(e.kind);
      const pad = solid ? 0 : 5;
      const touching = e.x - pad < right && e.x + e.w + pad > left && e.y - pad < top && e.y + e.h + pad > state.height;
      if (touching && !solid) {
        e.gone = true;
        if (e.kind === "note") {
          state.notes++;
          events.push({ type: "note", points: gain(100), x: e.x, y: e.y });
          if (!state.fever && ++state.feverNotes >= FEVER_NOTES) {
            state.feverNotes = 0; state.fever = FEVER_TICKS; state.fevers++; events.push({ type: "fever" });
          }
        } else if (e.kind === "heart") { state.hearts = Math.min(3, state.hearts + 1); events.push({ type: "heart" }); }
        else if (e.kind === "shield") { state.shield = true; events.push({ type: "shield" }); }
        else { state.boost = BOOST_TICKS; events.push({ type: "boost" }); }
      } else if (touching && state.boost) {
        e.gone = true; gain(50); events.push({ type: "smash" });
      } else if (touching && tick >= hitUntil) {
        e.passed = true;
        hitUntil = tick + INVINCIBLE_TICKS;
        state.combo = 0;
        if (state.shield) { state.shield = false; events.push({ type: "block" }); }
        else { state.hearts--; events.push({ type: "hit" }); }
      } else if (solid && !e.passed && e.x + e.w < left) {
        e.passed = true; dodge(e);
      }
    }
    function dodge(e: RunEntity) {
      state.combo++;
      state.bestCombo = Math.max(state.bestCombo, state.combo);
      events.push({ type: "dodge", points: gain(Math.min(150, 40 + state.combo * 10)), x: e.x + e.w, y: e.y + e.h });
      if (state.combo % 3 === 0) events.push({ type: "combo", count: state.combo });
    }
    while (entities.length && entities[0].x + entities[0].w < state.distance - 40) entities.shift();

    if (state.fever && --state.fever === 0) events.push({ type: "feverEnd" });
    if (state.boost) state.boost--;
    state.invincible = tick < hitUntil;
    state.meters = Math.floor(state.distance / CELLS_PER_METER);
    state.score = Math.floor(points);
    if (state.height < FALL_OUT) { state.fell = true; events.push({ type: "fall" }); }
    state.done = state.fell || state.hearts <= 0 || tick >= RUN_TICKS;
  }
  return { state, entities, events, step };
}

/** Replays the presses. A run may stop early (the player left), never after it was over. */
export function verifyRun(seed: number, ticks: number, inputs: RunInput[], score: number, elapsed: number) {
  if (!Number.isInteger(ticks) || ticks < 1 || ticks > RUN_TICKS ||
      !Number.isFinite(elapsed) || ticks * 1000 / FPS > elapsed + 32 ||
      inputs.some(([tick, mask], i) => !Number.isInteger(tick) || tick < 1 || tick > ticks ||
        !Number.isInteger(mask) || mask < 1 || mask > 7 || (i > 0 && tick <= inputs[i - 1][0]))) throw Error("INVALID_RUN");
  const round = runRound(seed);
  let next = 0;
  while (round.state.tick < ticks) {
    if (round.state.done) throw Error("INVALID_RUN");
    const mask = inputs[next]?.[0] === round.state.tick + 1 ? inputs[next++][1] : 0;
    round.step(mask);
  }
  if (round.state.score !== score) throw Error("INVALID_RUN");
  return round.state;
}
