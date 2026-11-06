import { cleanup, render, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const player = vi.hoisted(() => ({ loadAnimation: vi.fn() }));
vi.mock("lottie-web/build/player/lottie_light", () => ({ default: player }));
import { resetStampPressPlayer, StampPress } from "./stamp-press";

const motion = (reduce: boolean) => { Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: reduce }) }); };
beforeEach(() => {
  resetStampPressPlayer();
  player.loadAnimation.mockReset().mockReturnValue({ addEventListener: (_: string, done: () => void) => done(), destroy: vi.fn() });
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}")));
  motion(false);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("plays once without looping and reports the end", async () => {
  const done = vi.fn();
  render(<StampPress state="press" onDone={done} />);
  await waitFor(() => expect(player.loadAnimation).toHaveBeenCalledTimes(1));
  expect(player.loadAnimation.mock.calls[0][0]).toMatchObject({ loop: false, autoplay: true, renderer: "svg" });
  expect(done).toHaveBeenCalled();
});
it("shows the still frame and never loads the player under reduced motion", async () => {
  motion(true);
  const done = vi.fn();
  const { container } = render(<StampPress state="press" onDone={done} />);
  expect(container.querySelector("img")).toHaveAttribute("src", "/lottie/stamp-press-final.svg");
  await waitFor(() => expect(done).toHaveBeenCalled());
  expect(player.loadAnimation).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});
it("falls back to the still frame when the asset cannot be read", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 500 })));
  const { container } = render(<StampPress state="press" />);
  await waitFor(() => expect(container.querySelector("img")).toHaveAttribute("src", "/lottie/stamp-press-final.svg"));
});
it("draws a faint outline before the stamp and the still frame when already stamped", () => {
  const { container, rerender } = render(<StampPress state="idle" />);
  expect(container.querySelector("[data-stamp-press=idle]")).toBeInTheDocument();
  rerender(<StampPress state="stamped" />);
  expect(container.querySelector("[data-stamp-press=stamped]")).toBeInTheDocument();
  expect(player.loadAnimation).not.toHaveBeenCalled();
});
it("ships a 0.9 second, 60fps asset", () => {
  const asset = JSON.parse(readFileSync("public/lottie/stamp-press.json", "utf8")) as { fr: number; op: number; ip: number; layers: unknown[]; assets: unknown[] };
  expect(asset.fr).toBe(60);
  expect((asset.op - asset.ip) / asset.fr).toBeCloseTo(0.9);
  expect(asset.layers.length).toBeGreaterThan(0);
  expect(asset.assets).toEqual([]);
});
