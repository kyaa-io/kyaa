import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { toStageHostProjection } from "../domain/stage-host-projection";
import { useStageHostEndpoint, useStageHostSource } from "./use-stage-host-source";

const endpoint = `ws://127.0.0.1:4173/source?token=${"a".repeat(64)}`;
class Socket {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 1;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  send = vi.fn(); close = vi.fn();
  constructor(public url: string) { Socket.instances.push(this); }
}
const projection = toStageHostProjection({ presentation: null, tiktok: null, stage: null, scope: "all", presentationFailed: false, tiktokFailed: false });
beforeEach(() => { Socket.instances = []; vi.stubGlobal("WebSocket", Socket); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); window.history.replaceState(null, "", "/"); });
it("consumes the secret fragment immediately, including before authorization, without auto-connecting", () => {
  window.history.replaceState(null, "", `/admin?lang=ko#stage-host=${encodeURIComponent(endpoint)}`);
  const { result } = renderHook(() => useStageHostEndpoint());
  expect(result.current).toBe(endpoint);
  expect(window.location.hash).toBe(""); expect(window.location.search).toBe("?lang=ko");
  expect(Socket.instances).toHaveLength(0);
});
it("leaves ordinary pages and unrelated fragments alone", () => {
  window.history.replaceState(null, "", "/admin#ordinary");
  const { result } = renderHook(() => useStageHostEndpoint());
  expect(result.current).toBeNull(); expect(window.location.hash).toBe("#ordinary");
  const { result: bridge } = renderHook(() => useStageHostSource({ endpoint: null, authorized: true, projection, onScope: vi.fn(), onRefresh: vi.fn() }));
  act(() => bridge.current.connect()); expect(Socket.instances).toHaveLength(0);
});
it("sends only projections after explicit connect, handles read commands, and stops on auth loss/unmount", () => {
  vi.useFakeTimers();
  const onScope = vi.fn(), onRefresh = vi.fn();
  const { result, rerender, unmount } = renderHook(({ authorized }) => useStageHostSource({ endpoint, authorized, projection, onScope, onRefresh }), { initialProps: { authorized: true } });
  expect(Socket.instances).toHaveLength(0);
  act(() => result.current.connect()); const socket = Socket.instances[0]!;
  act(() => socket.onopen!());
  expect(JSON.parse(socket.send.mock.calls[0]![0])).toEqual({ type: "projection", projection });
  act(() => { for (const command of [{ action: "draw" }, { action: "refresh", url: "https://evil.test" }, { action: "scope", scope: "all", ownerId: "secret" }]) socket.onmessage!({ data: JSON.stringify({ type: "source-command", ...command }) }); });
  expect(onScope).not.toHaveBeenCalled(); expect(onRefresh).not.toHaveBeenCalled();
  act(() => { socket.onmessage!({ data: JSON.stringify({ type: "source-command", action: "scope", scope: "event-day" }) }); socket.onmessage!({ data: JSON.stringify({ type: "source-command", action: "refresh" }) }); });
  expect(onScope).toHaveBeenCalledWith("event-day"); expect(onRefresh).toHaveBeenCalledOnce();
  act(() => vi.advanceTimersByTime(1000)); expect(socket.send).toHaveBeenCalledTimes(2);
  rerender({ authorized: false }); expect(socket.close).toHaveBeenCalledOnce();
  act(() => { vi.advanceTimersByTime(3000); socket.onmessage!({ data: JSON.stringify({ type: "source-command", action: "refresh" }) }); result.current.connect(); });
  expect(socket.send).toHaveBeenCalledTimes(2); expect(onRefresh).toHaveBeenCalledOnce(); expect(Socket.instances).toHaveLength(1);
  rerender({ authorized: true }); act(() => result.current.connect());
  const second = Socket.instances[1]!; unmount(); expect(second.close).toHaveBeenCalledOnce();
});
it('deduplicates commands, rejects changed arguments, and suppresses late ACK after source replacement', async () => {
  let finish: (value: { status: 'confirmed' }) => void;
  const onOperator = vi.fn(() => new Promise<{ status: 'confirmed' }>(resolve => { finish = resolve; }));
  const { result, unmount } = renderHook(() => useStageHostSource({ endpoint, authorized: true, projection, onScope: vi.fn(), onRefresh: vi.fn(), onOperator }));
  act(() => result.current.connect()); const old = Socket.instances[0]!;
  act(() => old.onopen!());
  const command = { type: 'operator-command', commandId: '11111111-1111-4111-8111-111111111111', requestId: '22222222-2222-4222-8222-222222222222', operation: 'onsite-execute' };
  act(() => { old.onmessage!({ data: JSON.stringify(command) }); old.onmessage!({ data: JSON.stringify(command) }); });
  expect(onOperator).toHaveBeenCalledTimes(1);
  await act(async () => { old.onmessage!({ data: JSON.stringify({ ...command, operation: 'live-draw' }) }); });
  expect(JSON.parse(old.send.mock.calls.at(-1)![0]).status).toBe('rejected');
  act(() => result.current.disconnect()); act(() => result.current.connect()); const next = Socket.instances[1]!;
  act(() => next.onopen!());
  await act(async () => { finish!({ status: 'confirmed' }); });
  expect(next.send.mock.calls.some(([value]) => JSON.parse(value).type === 'operator-result')).toBe(false);
  expect(onOperator).toHaveBeenCalledTimes(1);
  unmount();
});
it('explicit retry bypasses only the cached outcome and still rejects changed arguments', async () => {
  const onOperator = vi.fn(async () => ({ status: 'uncertain' as const }));
  const { result, unmount } = renderHook(() => useStageHostSource({ endpoint, authorized: true, projection, onScope: vi.fn(), onRefresh: vi.fn(), onOperator }));
  act(() => result.current.connect()); const socket = Socket.instances[0]!;
  act(() => socket.onopen!());
  const command = { commandId: '11111111-1111-4111-8111-111111111111', requestId: '22222222-2222-4222-8222-222222222222', operation: 'onsite-execute' };
  await act(async () => socket.onmessage!({ data: JSON.stringify({ type: 'operator-command', ...command }) }));
  await act(async () => socket.onmessage!({ data: JSON.stringify({ type: 'operator-retry', ...command }) }));
  expect(onOperator).toHaveBeenCalledTimes(2);
  expect(onOperator.mock.calls[1]).toEqual([command, false, true]);
  await act(async () => socket.onmessage!({ data: JSON.stringify({ type: 'operator-retry', ...command, requestId: '33333333-3333-4333-8333-333333333333' }) }));
  expect(onOperator).toHaveBeenCalledTimes(2);
  expect(JSON.parse(socket.send.mock.calls.at(-1)![0]).status).toBe('rejected');
  unmount();
});
