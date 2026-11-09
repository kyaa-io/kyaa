import { render, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";

const engine = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("./machine-art", () => ({ createCapsuleEngine: engine.create }));

import MachineCanvas from "./machine-canvas";

it("keeps the still image when WebGL 2 is missing and never builds the scene", async () => {
  const onUnavailable = vi.fn(), onEngine = vi.fn();
  render(<MachineCanvas visible onEngine={onEngine} onUnavailable={onUnavailable} onContextLost={vi.fn()} onContextRestored={vi.fn()} />);
  await waitFor(() => expect(onUnavailable).toHaveBeenCalledTimes(1)); // jsdom has no webgl2 context
  expect(engine.create).not.toHaveBeenCalled();
  expect(onEngine).not.toHaveBeenCalled();
});
