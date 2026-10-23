import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { notifyFanActivityUpdated } from "./fan-activity-updates";
import { useOwnedFanResource } from "./use-owned-fan-resource";

const session = { ready: true, pending: false, ownerId: null as string | null, generation: 0 };
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => session }));

const parse = (value: unknown) => value as { status: string };
const pending = (data: { status: string }) => data.status === "queued";
const getAccessToken = async () => "token";
const auth = { ready: true, authenticated: true, user: { id: "owner-a" }, getAccessToken };
const response = (status: string) => Response.json({ status });
const flush = async () => { for (let i = 0; i < 12; i += 1) await Promise.resolve(); };

afterEach(() => {
  Object.assign(session, { ready: true, pending: false, ownerId: null, generation: 0 });
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
});

describe("owned fan resource freshness", () => {
  it.each(["token", "fetch", "body"] as const)("recovers a stalled %s and ignores its late completion", async (stage) => {
    vi.useFakeTimers();
    let resolveLate!: (value: never) => void;
    const stalled = new Promise<never>(resolve => { resolveLate = resolve; });
    const token = vi.fn().mockResolvedValue("token");
    const fetcher = vi.fn().mockResolvedValue(response("fresh"));
    if (stage === "token") token.mockReturnValueOnce(stalled);
    else if (stage === "fetch") fetcher.mockReturnValueOnce(stalled);
    else fetcher.mockResolvedValueOnce({ ok: true, status: 200, json: () => stalled });
    vi.stubGlobal("fetch", fetcher);
    const { result } = renderHook(() => useOwnedFanResource("/owned", parse, { ...auth, getAccessToken: token }));
    await act(flush);
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    expect(result.current.state).toEqual({ status: "error", kind: "network" });
    if (stage !== "token") expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => { result.current.retry(); await flush(); });
    expect(result.current.state).toEqual({ status: "ready", data: { status: "fresh" } });
    const calls = fetcher.mock.calls.length;
    await act(async () => {
      resolveLate((stage === "token" ? "expired-token" : stage === "fetch" ? response("stale") : { status: "stale" }) as never);
      await flush();
    });
    expect(fetcher).toHaveBeenCalledTimes(calls);
    expect(result.current.state).toEqual({ status: "ready", data: { status: "fresh" } });
  });

  it.each(["token", "fetch"] as const)("runs a queued retry after a stalled %s deadline", async (stage) => {
    vi.useFakeTimers();
    const stalled = new Promise<never>(() => {});
    const token = vi.fn().mockResolvedValue("token");
    const fetcher = vi.fn().mockResolvedValue(response("recovered"));
    if (stage === "token") token.mockReturnValueOnce(stalled);
    else fetcher.mockReturnValueOnce(stalled);
    vi.stubGlobal("fetch", fetcher);
    const { result } = renderHook(() => useOwnedFanResource("/owned", parse, { ...auth, getAccessToken: token }));
    await act(flush);
    act(() => result.current.retry());
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    expect(token).toHaveBeenCalledTimes(2);
    expect(result.current.state).toEqual({ status: "ready", data: { status: "recovered" } });
  });

  it("keeps an authoritative replacement when an older token lookup returns null", async () => {
    let resolveToken!: (value: string | null) => void;
    const token = vi.fn().mockImplementationOnce(() => new Promise<string | null>(resolve => { resolveToken = resolve; }))
      .mockResolvedValue("token");
    const fetcher = vi.fn().mockResolvedValue(response("later"));
    vi.stubGlobal("fetch", fetcher);
    const { result } = renderHook(() => useOwnedFanResource("/owned", parse, { ...auth, getAccessToken: token }));
    await act(flush);
    act(() => result.current.replaceData({ status: "saved" }));
    await act(async () => { resolveToken(null); await flush(); });
    expect(result.current.state).toEqual({ status: "ready", data: { status: "saved" } });
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.current.refreshFailed).toBe(false);
    await act(async () => { result.current.retry(); await flush(); });
    expect(result.current.state).toEqual({ status: "ready", data: { status: "later" } });
  });

  it("retains background data on deadline and protects authoritative replacements", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValueOnce(response("before"))
      .mockImplementationOnce(() => new Promise<never>(() => {}))
      .mockImplementationOnce(() => new Promise<never>(() => {}))
      .mockResolvedValueOnce(response("later"));
    vi.stubGlobal("fetch", fetcher);
    const { result } = renderHook(() => useOwnedFanResource("/owned", parse, auth));
    await act(flush);
    await act(async () => { result.current.retry(); await flush(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    expect(result.current.state).toEqual({ status: "ready", data: { status: "before" } });
    expect(result.current.refreshFailed).toBe(true);
    await act(async () => { result.current.retry(); await flush(); });
    act(() => result.current.replaceData({ status: "saved" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    expect(result.current.state).toEqual({ status: "ready", data: { status: "saved" } });
    expect(result.current.refreshFailed).toBe(false);
    await act(async () => { result.current.retry(); await flush(); });
    expect(result.current.state).toEqual({ status: "ready", data: { status: "later" } });
  });

  it("does not request or expose a private snapshot until the destination session is ready", async () => {
    Object.assign(session, { ready: false, pending: true, ownerId: "owner-a", generation: 1 });
    const fetcher = vi.fn(async () => response("owner-a-record"));
    vi.stubGlobal("fetch", fetcher);
    const { result, rerender } = renderHook(() => useOwnedFanResource("/owned", parse, auth));
    expect(result.current.state).toEqual({ status: "loading" });
    expect(fetcher).not.toHaveBeenCalled();

    Object.assign(session, { ready: true, pending: false, generation: 1 });
    rerender();
    await waitFor(() => expect(result.current.state).toEqual({ status: "ready", data: { status: "owner-a-record" } }));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("keeps a validated mutation response over an older read and allows later fresh reads", async () => {
    let resolveRead!: (response: Response) => void;
    const fetcher = vi.fn().mockResolvedValueOnce(response("before"))
      .mockImplementationOnce(() => new Promise<Response>(resolve => { resolveRead = resolve; }))
      .mockResolvedValueOnce(response("later"));
    vi.stubGlobal("fetch", fetcher);
    const { result } = renderHook(() => useOwnedFanResource("/owned", parse, auth));
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    await act(async () => { result.current.retry(); await flush(); });
    act(() => result.current.replaceData({ status: "saved" }));
    await act(async () => { resolveRead(response("before")); await flush(); });
    expect(result.current.state).toEqual({ status: "ready", data: { status: "saved" } });
    await act(async () => { result.current.retry(); await flush(); });
    expect(result.current.state).toEqual({ status: "ready", data: { status: "later" } });
  });
  it("polls queued issuance without blanking content and stops once minted", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValueOnce(response("queued")).mockResolvedValueOnce(response("minted"));
    vi.stubGlobal("fetch", fetcher);
    const { result } = renderHook(() => useOwnedFanResource("/owned", parse, auth, pending));
    await act(flush);
    expect(result.current.state).toEqual({ status: "ready", data: { status: "queued" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(result.current.state).toEqual({ status: "ready", data: { status: "minted" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ cache: "no-store" });
  });

  it("pauses polling while hidden and reads when the tab becomes visible", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValueOnce(response("queued")).mockResolvedValueOnce(response("minted"));
    vi.stubGlobal("fetch", fetcher);
    const { result } = renderHook(() => useOwnedFanResource("/owned", parse, auth, pending));
    await act(flush);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    expect(fetcher).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); await flush(); });
    expect(result.current.state).toEqual({ status: "ready", data: { status: "minted" } });
  });

  it("refreshes same-owner events and return visits, ignoring another owner's event", async () => {
    const fetcher = vi.fn(async () => response("minted"));
    vi.stubGlobal("fetch", fetcher);
    const { result } = renderHook(() => useOwnedFanResource("/owned", parse, auth));
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    await act(async () => { notifyFanActivityUpdated("owner-b"); await flush(); });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await act(async () => { notifyFanActivityUpdated("owner-a"); await flush(); });
    expect(fetcher).toHaveBeenCalledTimes(2);
    await act(async () => { window.dispatchEvent(new Event("pageshow")); await flush(); });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("never displays the previous owner or accepts their delayed response after switching accounts", async () => {
    let resolveOld!: (value: Response) => void;
    const fetcher = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { resolveOld = resolve; }))
      .mockResolvedValueOnce(response("owner-b-record"));
    vi.stubGlobal("fetch", fetcher);
    const { result, rerender } = renderHook(({ owner }) => useOwnedFanResource("/owned", parse, { ...auth, user: { id: owner } }), { initialProps: { owner: "owner-a" } });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    rerender({ owner: "owner-b" });
    expect(result.current.state.status).toBe("loading");
    await waitFor(() => expect(result.current.state).toEqual({ status: "ready", data: { status: "owner-b-record" } }));
    await act(async () => { resolveOld(response("owner-a-record")); await flush(); });
    expect(result.current.state).toEqual({ status: "ready", data: { status: "owner-b-record" } });
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it("preserves records on transient refresh failure but clears them when authorization expires", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response("queued"))
      .mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetcher);
    const { result } = renderHook(() => useOwnedFanResource("/owned", parse, auth));
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    await act(async () => { result.current.retry(); await flush(); });
    expect(result.current.state).toEqual({ status: "ready", data: { status: "queued" } });
    expect(result.current.refreshFailed).toBe(true);
    await act(async () => { result.current.retry(); await flush(); });
    expect(result.current.state).toEqual({ status: "error", kind: "auth" });
  });

  it("coalesces concurrent invalidations and cancels reads and polling on unmount", async () => {
    vi.useFakeTimers();
    let resolveRead!: (value: Response) => void;
    const fetcher = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { resolveRead = resolve; }))
      .mockResolvedValueOnce(response("queued"));
    vi.stubGlobal("fetch", fetcher);
    const { unmount } = renderHook(() => useOwnedFanResource("/owned", parse, auth, pending));
    await act(flush);
    await act(async () => {
      notifyFanActivityUpdated("owner-a"); window.dispatchEvent(new Event("focus"));
      resolveRead(response("queued")); await flush();
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("recovers a failed summary invalidation even when the resource does not poll issuance", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValueOnce(response("before-reaction"))
      .mockRejectedValueOnce(new Error("temporary outage"))
      .mockResolvedValueOnce(response("after-reaction"));
    vi.stubGlobal("fetch", fetcher);
    const { result } = renderHook(() => useOwnedFanResource("/summary", parse, auth));
    await act(flush);
    await act(async () => { notifyFanActivityUpdated("owner-a"); await flush(); });
    expect(result.current.refreshFailed).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(result.current.state).toEqual({ status: "ready", data: { status: "after-reaction" } });
    expect(result.current.refreshFailed).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
