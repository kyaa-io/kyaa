import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { LuckyStage } from "./lucky-stage";

const canvas = vi.hoisted(() => ({ props: [] as Array<Record<string, unknown>> }));
const gpu = vi.hoisted(() => ({ ok: true, checks: 0 }));
vi.mock("./gpu", () => ({ canRunCapsuleMachine: async () => { gpu.checks++; return gpu.ok; } }));
// The three.js chunk never loads in jsdom: the dynamic canvas stands in as a marker that records its props.
vi.mock("next/dynamic", () => ({ default: () => function MachineCanvasStub(props: Record<string, unknown>) { canvas.props.push(props); return <canvas data-testid="machine-canvas" />; } }));

function media(reduced: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: reduced && query.includes("reduce"), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
}
class Observer {
  static near = true;
  constructor(private cb: IntersectionObserverCallback) {}
  observe(target: Element) { if (Observer.near) this.cb([{ isIntersecting: true, target } as IntersectionObserverEntry], this as unknown as IntersectionObserver); }
  disconnect() {} unobserve() {} takeRecords() { return []; }
}
function idle(mode: "now" | "never") {
  vi.stubGlobal("requestIdleCallback", (cb: () => void) => { if (mode === "now") cb(); return 1; });
  vi.stubGlobal("cancelIdleCallback", () => {});
}
function connection(saveData: boolean) { Object.defineProperty(navigator, "connection", { value: { saveData }, configurable: true }); }

beforeEach(() => { canvas.props = []; gpu.ok = true; gpu.checks = 0; Observer.near = true; media(false); idle("now"); connection(false); vi.stubGlobal("IntersectionObserver", Observer); });

const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
const stage = () => document.querySelector("[data-lucky-stage]") as HTMLElement;

it("renders both still images and loads the machine with idle and a framing once the stage is near and the browser is idle", async () => {
  const view = render(<LuckyStage />);
  expect(await screen.findByTestId("machine-canvas")).toBeInTheDocument();
  expect(view.container.querySelector("picture source")).toHaveAttribute("srcset", "/images/capsule-machine/lucky-stage-wide.webp");
  expect(view.container.querySelector("img")).toHaveAttribute("src", "/images/capsule-machine/lucky-stage-narrow.webp");
  expect(canvas.props.at(-1)).toMatchObject({ idle: true, framing: { fov: 30 } });
  expect(gpu.checks).toBe(1);
});

it("does not ask for three.js or the GPU check before the stage is near the screen", async () => {
  Observer.near = false;
  render(<LuckyStage />); await settle();
  expect(screen.queryByTestId("machine-canvas")).toBeNull(); expect(gpu.checks).toBe(0); expect(stage()).toHaveAttribute("data-lucky-graphics", "still");
});

it("waits for an idle moment after the first paint", async () => {
  idle("never");
  render(<LuckyStage />); await settle();
  expect(screen.queryByTestId("machine-canvas")).toBeNull(); expect(gpu.checks).toBe(0);
});

it("keeps the still image under reduced motion without the GPU check", async () => {
  media(true);
  render(<LuckyStage />); await settle();
  expect(screen.queryByTestId("machine-canvas")).toBeNull(); expect(gpu.checks).toBe(0);
});

it("keeps the still image when the browser asks to save data", async () => {
  connection(true);
  render(<LuckyStage />); await settle();
  expect(screen.queryByTestId("machine-canvas")).toBeNull(); expect(gpu.checks).toBe(0);
});

it("keeps the still image on a tier 0 GPU", async () => {
  gpu.ok = false;
  render(<LuckyStage />);
  await waitFor(() => expect(gpu.checks).toBe(1)); await settle();
  expect(screen.queryByTestId("machine-canvas")).toBeNull();
});

it("returns to the still image when the scene stalls", async () => {
  render(<LuckyStage />);
  await screen.findByTestId("machine-canvas");
  act(() => (canvas.props.at(-1)!.onStall as () => void)());
  await waitFor(() => expect(screen.queryByTestId("machine-canvas")).toBeNull());
});
