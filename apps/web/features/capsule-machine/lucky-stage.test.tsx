import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

it("offers image enlargement only while paused", async () => {
  const view = render(<LuckyStage paused locale="en" />);
  expect(screen.getByRole("button", { name: "Coming soon" })).toBeInTheDocument();
  view.rerender(<LuckyStage locale="en" />);
  expect(screen.queryByRole("button", { name: "Coming soon" })).toBeNull();
});

it("plays a reward-free preview without submitting an entry", async () => {
  render(<LuckyStage paused locale="en" />);
  await waitFor(() => expect(gpu.checks).toBe(1));
  fireEvent.click(screen.getByRole("button", {name:"Coming soon"}));
  await screen.findByTestId("machine-canvas");
  const play = vi.fn().mockResolvedValue([]), clear = vi.fn();
  act(() => (canvas.props.at(-1)!.onEngine as (value: unknown) => void)({play,clear}));
  fireEvent.click(screen.getByRole("dialog").querySelector('button[aria-label="Coming soon"]')!);
  await waitFor(() => expect(play).toHaveBeenCalledWith(1, [], true));
  await waitFor(() => expect(clear).toHaveBeenCalled());
});

it("unlocks on close and ignores the previous play when reopened", async () => {
  render(<LuckyStage paused locale="en" />);
  await waitFor(() => expect(gpu.checks).toBe(1));
  fireEvent.click(screen.getByRole("button", {name:"Coming soon"}));
  await screen.findByTestId("machine-canvas");
  let finishOld!: () => void;
  const oldPlay = new Promise<string[]>(resolve => { finishOld = () => resolve([]); });
  const clear = vi.fn();
  act(() => (canvas.props.at(-1)!.onEngine as (value: unknown) => void)({play: () => oldPlay,clear}));
  fireEvent.click(screen.getByRole("dialog").querySelector('button[aria-label="Coming soon"]')!);
  fireEvent.click(screen.getByRole("button", {name:"Close"}));
  fireEvent.click(screen.getByRole("button", {name:"Coming soon"}));
  await screen.findByTestId("machine-canvas");
  expect(screen.getByRole("dialog").querySelector('button[aria-label="Coming soon"]')).not.toBeDisabled();
  let finishNew!: () => void;
  const newPlay = new Promise<string[]>(resolve => { finishNew = () => resolve([]); });
  act(() => (canvas.props.at(-1)!.onEngine as (value: unknown) => void)({play: () => newPlay,clear}));
  fireEvent.click(screen.getByRole("dialog").querySelector('button[aria-label="Coming soon"]')!);
  await act(async () => { finishOld(); await oldPlay; });
  expect(screen.getByRole("dialog").querySelector('button[aria-label="Coming soon"]')).toBeDisabled();
  await act(async () => { finishNew(); await newPlay; });
  expect(screen.getByRole("dialog").querySelector('button[aria-label="Coming soon"]')).not.toBeDisabled();
});

it("uses a short still reaction in the reduced-motion modal", async () => {
  media(true);
  render(<LuckyStage paused locale="en" />);
  fireEvent.click(screen.getByRole("button", {name:"Coming soon"}));
  expect(screen.queryByTestId("machine-canvas")).toBeNull();
  const machine = screen.getByRole("dialog").querySelector('button[aria-label="Coming soon"]')!;
  fireEvent.click(machine);
  expect(machine).toBeDisabled();
  await waitFor(() => expect(machine).not.toBeDisabled());
  expect(gpu.checks).toBe(0);
});
