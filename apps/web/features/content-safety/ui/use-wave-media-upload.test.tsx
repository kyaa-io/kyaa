import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useWaveMediaUpload } from "./use-wave-media-upload";
const state = vi.hoisted(() => ({ upload: vi.fn(), cancel: vi.fn(async (..._args: unknown[]) => {}), generation: 0 }));
vi.mock("@privy-io/react-auth", () => ({ usePrivy: () => ({ authenticated: true, user: { id: "owner" }, getAccessToken: async () => "token" }) }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => ({ ready: true, ownerId: "owner", generation: state.generation }) }));
vi.mock("./wave-media-upload", () => ({ validWaveFiles: () => true, cancelWaveUpload: (...args: unknown[]) => state.cancel(...args), uploadWaveMedia: (...args: unknown[]) => state.upload(...args) }));
afterEach(() => { state.upload.mockReset(); state.cancel.mockClear(); state.generation = 0; });
it.each(["unmount", "owner change"])("stops the current upload and never starts queued files after %s", async mode => {
  let finish!: () => void;
  state.upload.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
  const hook = renderHook(() => useWaveMediaUpload("wave_album"));
  act(() => hook.result.current.add([new File(["a"], "a.jpg"), new File(["b"], "b.jpg")]));
  await waitFor(() => expect(state.upload).toHaveBeenCalledTimes(1));
  const signal = state.upload.mock.calls[0][3] as AbortSignal;
  if (mode === "unmount") hook.unmount();
  else { state.generation++; hook.rerender(); }
  expect(signal.aborted).toBe(true);
  await act(async () => finish());
  expect(state.upload).toHaveBeenCalledTimes(1);
  hook.unmount();
});

it("cancels reserved media when removed or discarded", async () => {
  state.upload.mockImplementation(async task => { task.assetId = "reserved"; task.media = { state: "ready" }; });
  const hook = renderHook(() => useWaveMediaUpload("wave_album"));
  act(() => hook.result.current.add([new File(["a"], "a.jpg")]));
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  act(() => hook.result.current.remove(hook.result.current.items[0].key));
  expect(state.cancel).toHaveBeenCalledWith(expect.objectContaining({assetId:"reserved"}),expect.any(Function));
  act(() => hook.result.current.add([new File(["b"], "b.jpg")]));
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  hook.unmount(); expect(state.cancel).toHaveBeenCalledTimes(2);
});
