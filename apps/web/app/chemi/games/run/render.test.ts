import { expect, it, vi } from "vitest";
import { runRound } from "@/features/chemi/games/run";
import { drawField, SHIELD_FX_TICKS, type Art } from "./render";

function field() {
  const art = Object.fromEntries(["runner", "props", "street", "far", "fx", "glow"].map((name) => [name, { name, width: 64, height: 64 }])) as unknown as Art;
  const ctx = { globalAlpha: 1, drawImage: vi.fn(), fillRect: vi.fn(), strokeRect: vi.fn(), save: vi.fn(), restore: vi.fn(), translate: vi.fn(), scale: vi.fn(), fillStyle: "", strokeStyle: "", imageSmoothingEnabled: true };
  const sim = runRound(7);
  const fxFrames = () => ctx.drawImage.mock.calls.filter(([image]) => (image as { name: string }).name === "fx").map(([, sx]) => (sx as number) / 80);
  return { art, ctx, sim, fxFrames, draw: (reduced: boolean, shield = { gained: 0, broke: 0 }) => {
    ctx.drawImage.mockClear();
    ctx.fillRect.mockClear();
    drawField(ctx as unknown as CanvasRenderingContext2D, art, { width: 320, height: 160 }, sim, 0, reduced, shield);
  } };
}

it("wraps a shielded runner in the pixel bubble instead of an outline box", () => {
  const { sim, ctx, fxFrames, draw } = field();
  sim.state.shield = true;
  for (const tick of [0, 6, 12, 18]) { sim.state.tick = tick; draw(false); expect(fxFrames()).toEqual([tick / 6]); }
  sim.state.sliding = true;
  draw(false);
  expect(fxFrames()).toEqual([7]);
  expect(ctx.strokeRect).not.toHaveBeenCalled();
});

it("plays pickup and break effects in four steps, holding the first with reduced motion", () => {
  const { sim, fxFrames, draw } = field();
  draw(false, { gained: SHIELD_FX_TICKS, broke: 0 });
  expect(fxFrames()).toEqual([12]);
  draw(false, { gained: 1, broke: 0 });
  expect(fxFrames()).toEqual([15]);
  draw(false, { gained: 0, broke: 1 });
  expect(fxFrames()).toEqual([11]);
  sim.state.shield = true;
  sim.state.tick = 13;
  draw(true, { gained: 1, broke: 1 });
  expect(fxFrames()).toEqual([8, 0, 12]);
});

it("draws no light streaks across the field during fever", () => {
  const { sim, ctx, draw } = field();
  sim.state.fever = 300;
  draw(false);
  // Sparkle arms are at most five cells; the old streaks were 14-cell dashes across the field.
  expect(ctx.fillRect.mock.calls.filter(([, , w, h]) => h === 1 && w > 5)).toEqual([]);
});

it("gives the runner a lit rim and twinkles, more of them on a boost, none with reduced motion", () => {
  const { sim, ctx, draw } = field();
  const glow = () => ctx.drawImage.mock.calls.filter(([image]) => (image as { name: string }).name === "glow").length;
  const dots = () => ctx.fillRect.mock.calls.filter(([, , w, h]) => w === 1 && h === 1).length;
  sim.state.tick = 0;
  draw(false);
  expect(glow()).toBe(4);
  const plain = dots();
  expect(plain).toBeGreaterThan(0);
  sim.state.boost = 60;
  draw(false);
  expect(dots()).toBeGreaterThan(plain);
  draw(true);
  expect(glow()).toBe(4);
  expect(dots()).toBe(0);
});
