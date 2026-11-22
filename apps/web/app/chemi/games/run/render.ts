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
} as const;
export const POSE = { ready: 0, win: 13 } as const;
/** [x, y, w, h] inside props-v1.png */
export const PROPS = {
  cone: [0, 0, 19, 22], barricade: [21, 0, 28, 26], crates: [51, 0, 38, 60], bar: [91, 0, 87, 22],
  note: [180, 0, 11, 14], heart: [193, 0, 14, 13], heartEmpty: [209, 0, 14, 13], shield: [225, 0, 15, 16],
  boost: [242, 0, 16, 16], mailbox: [260, 0, 25, 28], leaves: [287, 0, 25, 14], crateIcon: [314, 0, 14, 22],
  barIcon: [330, 0, 32, 9], lantern: [364, 0, 18, 22],
} as const;
export type PropName = keyof typeof PROPS;
export type Art = Record<keyof typeof ART_FILES, HTMLImageElement>;

const FRAME = 64;
const GROUND = 40;
const PIT = ["#6b4a52", "#4a2f39", "#34212a", "#2b1a22"];

let pending: Promise<Art> | undefined;
export function loadArt(): Promise<Art> {
  pending ??= Promise.all(Object.entries(ART_FILES).map(([name, src]) => new Promise<[string, HTMLImageElement]>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve([name, image]);
    image.onerror = () => { pending = undefined; reject(Error("RUN_ART")); };
    image.src = src;
  }))).then((loaded) => Object.fromEntries(loaded) as Art);
  return pending;
}

/** Cells between the left edge and the runner: a fifth of the way in on wide fields. */
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
  const name = e.kind as PropName;
  const [, , w] = PROPS[name];
  const centered = x + (e.w - w) / 2;
  const bob = e.kind === "note" || e.kind === "heart" || e.kind === "shield" || e.kind === "boost" ? (Math.floor((tick + e.id * 7) / 12) % 2) : 0;
  const hung = e.kind === "bar" || e.kind === "lantern";
  prop(ctx, art, name, centered, hung ? ground - e.y - e.h + PROPS[name][3] : ground - e.y + 2 - bob - (e.kind === "note" ? 0 : 2));
}

export type FieldView = { width: number; height: number };

export function drawField(ctx: CanvasRenderingContext2D, art: Art, view: FieldView, sim: Pick<ReturnType<typeof runRound>, "state" | "entities">, hitFor: number) {
  const { state, entities } = sim;
  const { width, height } = view;
  const ground = height - GROUND;
  const origin = originOf(width);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#cdb9ae";
  ctx.fillRect(0, 0, width, height);
  tile(ctx, art.street, state.distance, width, height - art.street.height);
  for (const e of entities) {
    if (e.gone) continue;
    const x = Math.round(e.x - state.distance + origin);
    if (x > width + 8 || x + e.w < -40) continue;
    entity(ctx, art, e, x, ground, height, state.tick);
  }
  if (state.invincible && Math.floor(state.tick / 4) % 2) return;
  const airPhase = state.velocity > 180 ? 0 : state.velocity > 0 ? 1 : state.velocity > -180 ? 2 : 3;
  const pose = hitFor > 0 ? 20 + Math.min(3, Math.floor((24 - hitFor) / 6))
    : state.sliding ? 16 + Math.floor(state.tick / 5) % 4
      : !state.grounded ? (state.airJumps ? 12 : 8) + airPhase
        : Math.floor(state.tick / 4) % 8;
  const center = origin + (PLAYER.left + PLAYER.right) / 2;
  ctx.drawImage(art.runner, pose * FRAME, 0, FRAME, FRAME, Math.round(center - FRAME / 2), Math.round(ground - state.height - FRAME + 1), FRAME, FRAME);
  if (state.shield) {
    ctx.strokeStyle = "#ffffff";
    ctx.strokeRect(Math.round(center - 16) + 0.5, Math.round(ground - state.height - 50) + 0.5, 32, 50);
  }
}

/** Still picture for the choose and result screens: the far street, one pose, a few props. */
export function drawScene(ctx: CanvasRenderingContext2D, art: Art, view: FieldView, pose: keyof typeof POSE, props: readonly (readonly [PropName, number])[], floor: number) {
  const { width, height } = view;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#e9a03b";
  ctx.fillRect(0, 0, width, height);
  tile(ctx, art.far, 40, width, height - art.far.height + (20 - floor));
  const ground = height - floor;
  for (const [name, at] of props) prop(ctx, art, name, Math.round(width * at), ground + 1);
  ctx.drawImage(art.runner, POSE[pose] * FRAME, 0, FRAME, FRAME, Math.round(width * 0.46 - FRAME / 2), ground - FRAME + 1, FRAME, FRAME);
}
