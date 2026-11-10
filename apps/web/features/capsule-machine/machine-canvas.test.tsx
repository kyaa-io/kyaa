import { render, waitFor } from "@testing-library/react";
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
