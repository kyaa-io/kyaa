import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const gpu = vi.hoisted(() => ({ ok: vi.fn(async () => true) }));
const canvas = vi.hoisted(() => ({ props: [] as Array<Record<string, unknown>> }));
vi.mock("@/features/capsule-machine/gpu", () => ({ canRunCapsuleMachine: gpu.ok }));
vi.mock("next/dynamic", () => ({ default: () => (props: Record<string, unknown>) => { canvas.props.push(props); return <canvas data-raffle-card-canvas="" />; } }));

import { RaffleCardFloat } from "./card-float";

let reduced = false;
const observers: Array<(entries: Array<{ isIntersecting: boolean }>) => void> = [];
beforeEach(() => {
  reduced = false; canvas.props.length = 0; observers.length = 0; gpu.ok.mockClear(); gpu.ok.mockResolvedValue(true);
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduced-motion") ? reduced : false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.stubGlobal("IntersectionObserver", class { constructor(callback: (entries: Array<{ isIntersecting: boolean }>) => void) { observers.push(callback); } observe() {} disconnect() {} });
  vi.stubGlobal("requestIdleCallback", (callback: () => void) => { callback(); return 1; });
  vi.stubGlobal("cancelIdleCallback", vi.fn());
  Object.defineProperty(navigator, "connection", { value: { saveData: false }, configurable: true });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const mount = () => render(<div data-fan-print="desk"><RaffleCardFloat /></div>);
const enterScreen = () => act(() => { for (const notify of observers) notify([{ isIntersecting: true }]); });

it("keeps the DOM cards until the 3D cards report their first frame, then hides only the faces", async () => {
  const view = mount(), desk = view.container.firstElementChild as HTMLElement;
  expect(view.container.querySelector("canvas")).toBeNull();
  enterScreen();
  await waitFor(() => expect(view.container.querySelector("canvas")).not.toBeNull());
  expect(desk.dataset.fanPrintFloat).toBeUndefined();
  act(() => { (canvas.props.at(-1)!.onLive as (live: boolean) => void)(true); });
  expect(desk.dataset.fanPrintFloat).toBe("3d");
  // 프레임이 느리거나 장면이 실패하면 정지 그림으로 돌아가고 캔버스를 내린다
  act(() => { (canvas.props.at(-1)!.onUnavailable as () => void)(); });
  expect(desk.dataset.fanPrintFloat).toBeUndefined();
  expect(view.container.querySelector("canvas")).toBeNull();
});

it("never loads three.js with reduced motion, data saver or a tier-0 GPU", async () => {
  reduced = true;
  let view = mount(); enterScreen();
  await act(async () => { await Promise.resolve(); });
  expect(gpu.ok).not.toHaveBeenCalled(); expect(view.container.querySelector("canvas")).toBeNull();
  view.unmount(); reduced = false; observers.length = 0;

  Object.defineProperty(navigator, "connection", { value: { saveData: true }, configurable: true });
  view = mount(); enterScreen();
  await act(async () => { await Promise.resolve(); });
  expect(gpu.ok).not.toHaveBeenCalled(); expect(view.container.querySelector("canvas")).toBeNull();
  view.unmount(); observers.length = 0;

  Object.defineProperty(navigator, "connection", { value: { saveData: false }, configurable: true });
  gpu.ok.mockResolvedValue(false);
  view = mount(); enterScreen();
  await waitFor(() => expect(gpu.ok).toHaveBeenCalled());
  await act(async () => { await Promise.resolve(); });
  expect(view.container.querySelector("canvas")).toBeNull();
  expect((view.container.firstElementChild as HTMLElement).dataset.fanPrintFloat).toBeUndefined();
});

it("returns to the DOM cards on context loss and remounts the canvas on restore", async () => {
  const view = mount(), desk = view.container.firstElementChild as HTMLElement;
  enterScreen();
  await waitFor(() => expect(canvas.props.length).toBeGreaterThan(0));
  act(() => { (canvas.props.at(-1)!.onLive as (live: boolean) => void)(true); });
  act(() => { (canvas.props.at(-1)!.onContextLost as () => void)(); });
  expect(desk.dataset.fanPrintFloat).toBeUndefined();
  act(() => { (canvas.props.at(-1)!.onContextRestored as () => void)(); });
  expect(view.container.querySelector("canvas")).not.toBeNull();
  expect(desk.dataset.fanPrintFloat).toBeUndefined();
});
