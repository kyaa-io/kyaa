import { fireEvent, render, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";

const engine = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("./machine-art", () => ({ createCapsuleEngine: engine.create }));

import MachineCanvas from "./machine-canvas";

it("keeps the still image when the scene cannot be built", async () => {
  engine.create.mockRejectedValueOnce(new Error("Error creating WebGL context."));
  const onUnavailable = vi.fn(), onEngine = vi.fn();
  render(<MachineCanvas visible onEngine={onEngine} onUnavailable={onUnavailable} onContextLost={vi.fn()} onContextRestored={vi.fn()} />);
  await waitFor(() => expect(onUnavailable).toHaveBeenCalledTimes(1));
  expect(onEngine).not.toHaveBeenCalled();
});


it("hands idle, the framing and the stall callback to the engine, and nothing extra without them", async () => {
  const stop = { start: vi.fn(), stop: vi.fn(), setSize: vi.fn(), memory: () => ({ geometries: 1, textures: 1 }), dispose: vi.fn(), clear: vi.fn() };
  engine.create.mockResolvedValue(stop);
  const framing = { fov: 30, x: 0, y: 2, z: 8, lookX: 0, lookY: 1.7, hover: [0, 1, 3] as const };
  const props = { visible: true, onEngine: vi.fn(), onUnavailable: vi.fn(), onContextLost: vi.fn(), onContextRestored: vi.fn() };
  render(<MachineCanvas {...props} idle framing={framing} />);
  await waitFor(() => expect(engine.create).toHaveBeenCalled());
  expect(engine.create.mock.calls.at(-1)![1]).toMatchObject({ idle: true, framing });
  engine.create.mockClear();
  render(<MachineCanvas {...props} />);
  await waitFor(() => expect(engine.create).toHaveBeenCalled());
  expect(engine.create.mock.calls.at(-1)![1].idle).toBeUndefined();
});

function readyEngine() {
  return { start: vi.fn(), stop: vi.fn(), clear: vi.fn(), setSize: vi.fn(), memory: () => ({ geometries: 1, textures: 1 }), dispose: vi.fn() };
}
const canvasProps = () => ({ visible: true, onEngine: vi.fn(), onUnavailable: vi.fn(), onContextLost: vi.fn(), onContextRestored: vi.fn() });

it("restarts a fresh frame after pagehide/pageshow, even without visibilitychange", async () => {
  const machine = readyEngine(); engine.create.mockResolvedValueOnce(machine);
  const props = canvasProps();
  const view = render(<MachineCanvas {...props} />);
  await waitFor(() => expect(props.onEngine).toHaveBeenCalledWith(machine));
  machine.start.mockClear(); machine.stop.mockClear();
  fireEvent(window, new Event("pagehide"));
  expect(machine.stop).toHaveBeenCalled();
  view.rerender(<MachineCanvas {...props} />);
  expect(machine.start).not.toHaveBeenCalled();
  fireEvent(window, new Event("pageshow"));
  expect(machine.start).toHaveBeenCalledTimes(1);
  view.unmount();
  machine.start.mockClear();
  fireEvent(window, new Event("pageshow"));
  expect(machine.start).not.toHaveBeenCalled();
});

it("keeps a lost canvas hidden and stopped until the caller rebuilds it", async () => {
  const machine = readyEngine(); engine.create.mockResolvedValueOnce(machine);
  const props = canvasProps();
  const view = render(<MachineCanvas {...props} />);
  await waitFor(() => expect(props.onEngine).toHaveBeenCalledWith(machine));
  const canvas = view.container.querySelector("canvas")!;
  machine.start.mockClear();
  const lost = new Event("webglcontextlost", {cancelable:true});
  fireEvent(canvas,lost);
  expect(lost.defaultPrevented).toBe(true);
  expect(canvas).toHaveAttribute("data-context-lost");
  expect(machine.stop).toHaveBeenCalled(); expect(machine.clear).toHaveBeenCalled();
  view.rerender(<MachineCanvas {...props} />);
  fireEvent(document,new Event("visibilitychange"));
  fireEvent(window,new Event("pageshow"));
  expect(machine.start).not.toHaveBeenCalled();
  fireEvent(canvas,new Event("webglcontextrestored"));
  expect(props.onContextRestored).toHaveBeenCalledTimes(1);
});

it("pauses off screen and resumes on screen or on visible tab return", async () => {
  const machine=readyEngine(); engine.create.mockResolvedValueOnce(machine);
  const props=canvasProps();
  const view=render(<MachineCanvas {...props} />);
  await waitFor(()=>expect(props.onEngine).toHaveBeenCalledWith(machine));
  machine.start.mockClear();
  view.rerender(<MachineCanvas {...props} visible={false}/>);
  expect(machine.stop).toHaveBeenCalled();
  view.rerender(<MachineCanvas {...props} visible/>);
  expect(machine.start).toHaveBeenCalled();
  Object.defineProperty(document,"visibilityState",{configurable:true,value:"hidden"});
  fireEvent(document,new Event("visibilitychange"));
  machine.start.mockClear();
  Object.defineProperty(document,"visibilityState",{configurable:true,value:"visible"});
  machine.stop.mockClear();
  fireEvent(document,new Event("visibilitychange"));
  expect(machine.start).toHaveBeenCalledTimes(1);
  expect(machine.stop).toHaveBeenCalledTimes(1);
});
