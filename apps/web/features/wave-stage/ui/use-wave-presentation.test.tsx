import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { presentationFixture, tiktokFixture } from "../../../e2e/wave-stage-local/fixture";
import { useWavePresentation } from "./use-wave-presentation";

afterEach(() => vi.restoreAllMocks());
const getToken = async () => "test-token";
it("discards delayed responses across all → event day → all and clears data on denial", async () => {
  let pending: ((response: Response) => void) | undefined;
  let denied = false;
  vi.spyOn(globalThis, "fetch").mockImplementation(async url => {
    if (denied) return new Response(null, { status: 403 });
    if (String(url).endsWith("/tiktok")) return Response.json(tiktokFixture);
    if (String(url).includes("event-day")) return new Promise(resolve => { pending = resolve; });
    return Response.json(presentationFixture);
  });
  const { result } = renderHook(() => useWavePresentation(getToken));
  await waitFor(() => expect(result.current.presentation?.scope).toBe("all"));
  act(() => result.current.setScope("event-day"));
  expect(result.current.presentation).toBeNull();
  await waitFor(() => expect(pending).toBeDefined());
  act(() => result.current.setScope("all"));
  await waitFor(() => expect(result.current.presentation?.scope).toBe("all"));
  await act(async () => pending!(Response.json({ ...presentationFixture, scope: "event-day", from: "2026-10-21T15:00:00Z", to: "2026-10-22T15:00:00Z" })));
  expect(result.current.presentation?.scope).toBe("all");
  denied = true; act(() => result.current.refreshPresentation());
  await waitFor(() => expect(result.current.presentationAccess).toBe("denied"));
  expect(result.current.presentation).toBeNull(); expect(result.current.tiktok).toBeNull();
});

it("retains same-scope successful values with a failure flag, without inventing TikTok zero", async () => {
  let failed = false;
  vi.spyOn(globalThis, "fetch").mockImplementation(async url => {
    if (failed) throw new Error("offline");
    return Response.json(String(url).endsWith("/tiktok") ? tiktokFixture : presentationFixture);
  });
  const { result } = renderHook(() => useWavePresentation(getToken));
  await waitFor(() => expect(result.current.presentation).not.toBeNull());
  failed = true; act(() => result.current.refreshPresentation());
  await waitFor(() => expect(result.current.presentationFailed).toBe(true));
  expect(result.current.presentation?.creators[0]?.engagedFans).toBe(1284);
  expect(result.current.tiktokFailed).toBe(true);
});

it("polls DB presentation every second without overlapping slow reads, pauses hidden and resumes", async () => {
  vi.useFakeTimers();
  try {
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    let resolvePresentation: ((value: Response) => void) | undefined;
    const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(async url => String(url).endsWith("/tiktok") ? Response.json(tiktokFixture) : new Promise(resolve => { resolvePresentation = resolve; }));
    const { unmount } = renderHook(() => useWavePresentation(getToken));
    await act(async () => {});
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    const reads = () => fetcher.mock.calls.filter(([url]) => String(url).includes("/presentation"));
    expect(reads()).toHaveLength(1);
    await act(async () => { resolvePresentation!(Response.json(presentationFixture)); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(reads()).toHaveLength(2);
    hidden.mockReturnValue(true); act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(reads()[1]![1]?.signal?.aborted).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); }); expect(reads()).toHaveLength(2);
    hidden.mockReturnValue(false); await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(reads()).toHaveLength(3);
    unmount(); expect(reads()[2]![1]?.signal?.aborted).toBe(true);
  } finally { vi.useRealTimers(); }
});
