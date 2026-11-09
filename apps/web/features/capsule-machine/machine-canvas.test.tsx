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

