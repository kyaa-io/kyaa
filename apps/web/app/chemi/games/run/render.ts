import { PLAYER, type RunEntity, type runRound } from "@/features/chemi/games/run";

/**
 * Everything on the field is drawn in cells (art pixels) on one canvas and the canvas is scaled
 * by a whole number, so the runner, obstacles and street always share one dot size.
 */
export const ART = "/chemi/run";
export const ART_FILES = {
  runner: `${ART}/changha-64-v2.png`,
  props: `${ART}/props-v1.png`,
  street: `${ART}/street-changha-v1.png`,
  far: `${ART}/street-changha-far-v1.png`,
  fx: `${ART}/shield-fx-v1.png`,
} as const;
export const POSE = { ready: 24, win: 25 } as const;
/** [x, y, w, h] inside props-v1.png */
export const PROPS = {
  cone: [0, 0, 19, 22], barricade: [21, 0, 28, 26], crates: [51, 0, 38, 60], bar: [91, 0, 87, 22],
  note: [180, 0, 11, 14], heart: [193, 0, 14, 13], heartEmpty: [209, 0, 14, 13], shield: [225, 0, 15, 16],
  boost: [242, 0, 16, 16], mailbox: [260, 0, 25, 28], leaves: [287, 0, 25, 14], crateIcon: [314, 0, 14, 22],
  barIcon: [330, 0, 32, 9], lantern: [364, 0, 18, 22],
} as const;
export type PropName = keyof typeof PROPS;
export type Art = Record<keyof typeof ART_FILES, HTMLImageElement> & { glow: CanvasImageSource };

const FRAME = 64;
/** shield-fx-v1.png: 80-cell frames whose (8, 8) is the runner frame's top-left. */
const FX = 80;
const FX_FRAMES = { stand: 0, slide: 4, break: 8, pickup: 12, halo: 16 } as const;
/** Ticks each one-off shield effect stays on the field: four frames of six ticks. */
export const SHIELD_FX_TICKS = 24;
export type ShieldFx = { gained: number; broke: number };
const GROUND = 40;
const PIT = ["#6b4a52", "#4a2f39", "#34212a", "#2b1a22"];

const pending: Partial<Record<import("./shared").Character, Promise<Art>>> = {};
export function loadArt(character: import("./shared").Character = "changha"): Promise<Art> {
  pending[character] ??= Promise.all(Object.entries(ART_FILES).map(([name, src]) => new Promise<[string, HTMLImageElement]>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve([name, image]);
    image.onerror = () => { delete pending[character]; reject(Error("RUN_ART")); };
    image.src = src.replace("changha", character);
  }))).then((loaded) => {
    const art = Object.fromEntries(loaded) as Art;
    art.glow = glowSheet(art.runner);
    return art;
  });
  return pending[character];
}

const GLOW = "#fff4c2";
/** The runner sheet as one flat light colour, drawn a cell out on each side to give the runner a lit rim. */
function glowSheet(runner: HTMLImageElement) {
  const sheet = document.createElement("canvas");
  sheet.width = runner.width;
  sheet.height = runner.height;
  const ctx = sheet.getContext("2d")!;
  ctx.drawImage(runner, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = GLOW;
  ctx.fillRect(0, 0, sheet.width, sheet.height);
  return sheet;
}

/** Rim brightness steps (a full cycle is 32 ticks); reduced motion holds the middle one. */
const RIM = [0.45, 0.7, 0.95, 0.7] as const;
/** Sparkle sizes over one 36-tick life: a dot, a small cross, a long cross, back, then a rest. */
const TWINKLE = [0, 1, 2, 1, 0, -1] as const;
const SPARKLE_LIFE = 36;

function sparkles(ctx: CanvasRenderingContext2D, left: number, top: number, tick: number, count: number) {
  for (let i = 0; i < count; i++) {
    const at = tick + Math.floor(i * SPARKLE_LIFE / count);
    const size = TWINKLE[Math.floor(at % SPARKLE_LIFE / 6)];
    if (size < 0) continue;
    // Each life lands somewhere new around the runner's body; the spot only depends on the tick.
    const spot = (Math.imul(Math.floor(at / SPARKLE_LIFE) + 1, 2654435761) ^ Math.imul(i + 1, 40503)) >>> 0;
    const x = left + 10 + spot % 44;
    const y = top + 6 + (spot >>> 8) % 40;
    if (size > 0) {
      ctx.fillStyle = GLOW;
      ctx.fillRect(x - size, y, size * 2 + 1, 1);
      ctx.fillRect(x, y - size, 1, size * 2 + 1);
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x, y, 1, 1);
  }
}

/** Cells between the left edge and the runner: a fifth of the way in on wide fields. */
export function pixelScale(cssPixels: number) {
  const dpr = window.devicePixelRatio || 1;
  return Math.max(1, Math.round(cssPixels * dpr)) / dpr;
}

export function originOf(width: number) {
  return Math.max(0, Math.round(width * 0.2) - PLAYER.left - 7);
}

function tile(ctx: CanvasRenderingContext2D, image: HTMLImageElement, offset: number, width: number, top: number) {
  // Every other tile is mirrored so the street never shows a seam.
  const w = image.width;
  const first = Math.floor(offset / w);
  for (let i = first; (i - first) * w - (offset - first * w) < width; i++) {
    const x = Math.round(i * w - offset);
    if (i % 2) {
      ctx.save(); ctx.translate(x + w, top); ctx.scale(-1, 1); ctx.drawImage(image, 0, 0); ctx.restore();
    } else ctx.drawImage(image, x, top);
  }
}

function prop(ctx: CanvasRenderingContext2D, art: Art, name: PropName, x: number, bottom: number) {
  const [sx, sy, w, h] = PROPS[name];
  ctx.drawImage(art.props, sx, sy, w, h, Math.round(x), Math.round(bottom - h), w, h);
}

function entity(ctx: CanvasRenderingContext2D, art: Art, e: RunEntity, x: number, ground: number, height: number, tick: number) {
  if (e.kind === "pit") {
    const top = ground - 1;
    PIT.forEach((color, i) => { ctx.fillStyle = color; ctx.fillRect(x, top + [0, 4, 12, 24][i], e.w, height - top); });
    for (const post of [x - 5, x + e.w]) {
      for (let i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? "#2b1a16" : "#f0b429"; ctx.fillRect(post, top - 10 + i * 3, 5, 3); }
    }
    return;
  }
  if (e.kind === "shield") {
    // The item floats in a small bubble so it reads as the bubble the runner is about to wear.
    const frame = FX_FRAMES.halo + Math.floor((tick + e.id * 7) / 8) % 4;
    ctx.drawImage(art.fx, frame * FX, 0, FX, FX, Math.round(x + e.w / 2 - FX / 2), Math.round(ground - e.y - e.h / 2 - 2 - FX / 2), FX, FX);
  }
  const name = e.kind as PropName;
  const [, , w] = PROPS[name];
  const centered = x + (e.w - w) / 2;
  const bob = e.kind === "note" || e.kind === "heart" || e.kind === "shield" || e.kind === "boost" ? (Math.floor((tick + e.id * 7) / 12) % 2) : 0;
  const hung = e.kind === "bar" || e.kind === "lantern";
  prop(ctx, art, name, centered, hung ? ground - e.y - e.h + PROPS[name][3] : ground - e.y + 2 - bob - (e.kind === "note" ? 0 : 2));
}

export type FieldView = { width: number; height: number };

function fx(ctx: CanvasRenderingContext2D, art: Art, frame: number, left: number, top: number) {
  ctx.drawImage(art.fx, frame * FX, 0, FX, FX, left - 8, top - 8, FX, FX);
}

export function drawField(ctx: CanvasRenderingContext2D, art: Art, view: FieldView, sim: Pick<ReturnType<typeof runRound>, "state" | "entities">, hitFor: number, reducedMotion: boolean, shield: ShieldFx = { gained: 0, broke: 0 }) {
  const { state, entities } = sim;
  const { width, height } = view;
  const ground = height - GROUND;
  const origin = originOf(width);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#cdb9ae";
  ctx.fillRect(0, 0, width, height);
  tile(ctx, art.street, reducedMotion ? 0 : state.distance * 0.24, width, height - art.street.height);
  for (const e of entities) {
    if (e.gone) continue;
    const x = Math.round(e.x - state.distance + origin);
    if (x > width + 8 || x + e.w < -40) continue;
    entity(ctx, art, e, x, ground, height, state.tick);
  }
  const center = origin + (PLAYER.left + PLAYER.right) / 2;
  const left = Math.round(center - FRAME / 2);
  const top = Math.round(ground - state.height - FRAME + 1);
  // One-off effects step through their four frames; with reduced motion they hold the first frame.
  const step = (remaining: number) => reducedMotion ? 0 : Math.min(3, Math.floor((SHIELD_FX_TICKS - remaining) / 6));
  if (shield.broke > 0) fx(ctx, art, FX_FRAMES.break + step(shield.broke), left, top);
  if (!reducedMotion && state.invincible && Math.floor(state.tick / 4) % 2) return;
  const airPhase = state.velocity > 180 ? 0 : state.velocity > 0 ? 1 : state.velocity > -180 ? 2 : 3;
  const pose = hitFor > 0 ? 20 + Math.min(3, Math.floor((24 - hitFor) / 6))
    : state.sliding ? 16 + Math.floor(state.tick / 5) % 4
      : !state.grounded ? (state.airJumps ? 12 : 8) + airPhase
        : Math.floor(state.tick / 4) % 8;
  ctx.globalAlpha = RIM[reducedMotion ? 1 : Math.floor(state.tick / 8) % 4];
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) ctx.drawImage(art.glow, pose * FRAME, 0, FRAME, FRAME, left + dx, top + dy, FRAME, FRAME);
  ctx.globalAlpha = 1;
  ctx.drawImage(art.runner, pose * FRAME, 0, FRAME, FRAME, left, top, FRAME, FRAME);
  // Boost and fever double the sparkles; reduced motion keeps the still rim and drops them.
  if (!reducedMotion) sparkles(ctx, left, top, state.tick, state.boost || state.fever ? 6 : 3);
  if (state.shield) {
    const shimmer = reducedMotion ? 0 : Math.floor(state.tick / 6) % 4;
    fx(ctx, art, (state.sliding ? FX_FRAMES.slide : FX_FRAMES.stand) + shimmer, left, top);
  }
  if (shield.gained > 0) fx(ctx, art, FX_FRAMES.pickup + step(shield.gained), left, top);
}

/** Still picture for the choose and result screens: the far street, one pose, a few props. */
export function drawScene(ctx: CanvasRenderingContext2D, art: Art, view: FieldView, pose: keyof typeof POSE, props: readonly (readonly [PropName, number])[], floor: number, resultScene: boolean) {
  const { width, height } = view;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#e9a03b";
  ctx.fillRect(0, 0, width, height);
  const backdrop = resultScene ? art.street : art.far;
  tile(ctx, backdrop, 40, width, height - backdrop.height + ((resultScene ? GROUND : 20) - floor));
  const ground = height - floor;
  for (const [name, at] of props) prop(ctx, art, name, Math.round(width * at), ground + 1);
  ctx.drawImage(art.runner, POSE[pose] * FRAME, 0, FRAME, FRAME, Math.round(width * 0.46 - FRAME / 2), ground - FRAME + 1, FRAME, FRAME);
}
