import { fireEvent, render, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";

const art = vi.hoisted(() => ({ create: vi.fn(), measure: vi.fn() }));
vi.mock("./float-art", () => ({ createFloatEngine: art.create }));
vi.mock("./card-face", () => ({ measureCards: art.measure }));

import FloatCanvas from "./float-canvas";

const engine = () => ({ setLayout: vi.fn(), setPointer: vi.fn(), start: vi.fn(), stop: vi.fn(), renderStill: vi.fn(), dispose: vi.fn() });
const layout = { width: 300, height: 200, piles: [{}] };
const props = () => ({ desk: document.createElement("div"), visible: true, onLive: vi.fn(), onUnavailable: vi.fn(), onContextLost: vi.fn(), onContextRestored: vi.fn() });

it("stays on the DOM cards when the scene cannot be built or there is nothing to draw", async () => {
  art.measure.mockResolvedValueOnce(layout); art.create.mockImplementationOnce(() => { throw new Error("Error creating WebGL context."); });
  const failed = props(); render(<FloatCanvas {...failed} />);
  await waitFor(() => expect(failed.onUnavailable).toHaveBeenCalledTimes(1));
  expect(failed.onLive).not.toHaveBeenCalled();
  art.measure.mockResolvedValueOnce({ width: 300, height: 200, piles: [] });
  const empty = props(); render(<FloatCanvas {...empty} />);
  await waitFor(() => expect(empty.onUnavailable).toHaveBeenCalledTimes(1));
});

it("goes live with the measured layout, pauses off screen and on a hidden page, and disposes on unmount", async () => {
  const machine = engine(); art.measure.mockResolvedValueOnce(layout); art.create.mockReturnValueOnce(machine);
  const own = props(); const view = render(<FloatCanvas {...own} />);
  await waitFor(() => expect(own.onLive).toHaveBeenCalledWith(true));
  expect(machine.setLayout).toHaveBeenCalledWith(layout); expect(machine.start).toHaveBeenCalled();
  view.rerender(<FloatCanvas {...own} visible={false} />);
  expect(machine.stop).toHaveBeenCalled();
  machine.start.mockClear();
  view.rerender(<FloatCanvas {...own} visible />);
  expect(machine.start).toHaveBeenCalledTimes(1);
  fireEvent(window, new Event("pagehide")); machine.start.mockClear();
  view.rerender(<FloatCanvas {...own} visible />);
  expect(machine.start).not.toHaveBeenCalled();
  fireEvent(window, new Event("pageshow"));
  expect(machine.start).toHaveBeenCalledTimes(1);
  view.unmount();
  expect(machine.dispose).toHaveBeenCalledTimes(1); expect(own.onLive).toHaveBeenLastCalledWith(false);
});

it("drops to the DOM cards on a slow device and on context loss", async () => {
  const machine = engine(); art.measure.mockResolvedValueOnce(layout); art.create.mockReturnValueOnce(machine);
  const own = props(); const view = render(<FloatCanvas {...own} />);
  await waitFor(() => expect(own.onLive).toHaveBeenCalledWith(true));
  (art.create.mock.calls.at(-1)![1] as { onStall: () => void }).onStall();
  expect(own.onUnavailable).toHaveBeenCalledTimes(1);
  const lost = new Event("webglcontextlost", { cancelable: true });
  fireEvent(view.container.querySelector("canvas")!, lost);
  expect(lost.defaultPrevented).toBe(true); expect(own.onContextLost).toHaveBeenCalledTimes(1); expect(machine.stop).toHaveBeenCalled();
});
