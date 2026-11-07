import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DEFAULT_REQUEST_TIMEOUT_MS } from "@/features/reliability/client/request-deadline";
import { useNewsSource } from "./use-news-source";

const parse = (body: unknown) => body as { items: { id: string }[]; nextCursor: string | null };
const key = (item: { id: string }) => item.id;
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it("turns an unresponsive source into a retryable error and recovers on retry", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn().mockImplementationOnce(() => new Promise(() => {}))
    .mockResolvedValueOnce(Response.json({ items: [{ id: "recovered" }], nextCursor: null }));
  vi.stubGlobal("fetch", fetcher);
  const { result } = renderHook(() => useNewsSource("/api/source", parse, key));
  await act(async () => { await vi.advanceTimersByTimeAsync(DEFAULT_REQUEST_TIMEOUT_MS + 1); });
  expect(result.current.state.status).toBe("error");
  await act(async () => { result.current.retry(); await vi.advanceTimersByTimeAsync(0); });
  expect(result.current.state.status).toBe("ready");
  expect(result.current.state.data).toEqual([{ id: "recovered" }]);
});

it("joins sources reading one address into one request, and keeps other owners apart", async () => {
  const fetchMock = vi.fn(async () => Response.json({ items: [{ id: "a" }], nextCursor: null }));
  vi.stubGlobal("fetch", fetchMock);
  const first = (body: unknown) => ({ items: (body as { items: { id: string }[] }).items.map(item => ({ id: `first:${item.id}` })), nextCursor: null });
  const second = (body: unknown) => ({ items: (body as { items: { id: string }[] }).items.map(item => ({ id: `second:${item.id}` })), nextCursor: null });
  const itemKey = (item: { id: string }) => item.id;
  const owner = (name: string) => ({ key: name, ready: true, getToken: async () => name });
  const { result } = renderHook(() => ({
    a: useNewsSource("/api/shared", first, itemKey),
    b: useNewsSource("/api/shared", second, itemKey),
    c: useNewsSource("/api/shared", first, itemKey, owner("owner-a")),
    d: useNewsSource("/api/shared", first, itemKey, owner("owner-b")),
  }));
  await waitFor(() => expect(result.current.d.state.status).toBe("ready"));
  await waitFor(() => expect(result.current.a.state.status).toBe("ready"));
  expect(result.current.a.state.data).toEqual([{ id: "first:a" }]);
  expect(result.current.b.state.data).toEqual([{ id: "second:a" }]);
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(fetchMock.mock.calls.map(call => ((call as unknown as [string, RequestInit])[1].headers as { Authorization?: string } | undefined)?.Authorization)).toEqual([undefined, "Bearer owner-a", "Bearer owner-b"]);
});
