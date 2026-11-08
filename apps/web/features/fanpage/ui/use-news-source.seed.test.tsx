import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { PublicSeedProvider } from "./public-seed";
import { useNewsSource } from "./use-news-source";

type Item = { id: string };
const parse = (body: unknown) => body as { items: Item[]; nextCursor: string | null };
const key = (item: Item) => item.id;
const url = "/api/live-events?locale=ko&creator=star";
const wrapper = ({ children }: { children: ReactNode }) => <PublicSeedProvider seeds={{ [url]: { items: [{ id: "a" }, { id: "a" }, { id: "b" }], nextCursor: null } }}>{children}</PublicSeedProvider>;

afterEach(() => { vi.unstubAllGlobals(); });

it("draws a signed-out read from the server's copy at once and does not read it again", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const { result } = renderHook(() => useNewsSource(url, parse, key), { wrapper });
  expect(result.current.state.status).toBe("ready");
  expect(result.current.state.data.map(key)).toEqual(["a", "b"]);
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(fetcher).not.toHaveBeenCalled();
});

it("reads a signed-in viewer's own copy even when the server sent a public one", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [{ id: "mine" }], nextCursor: null })));
  vi.stubGlobal("fetch", fetcher);
  const { result } = renderHook(() => useNewsSource(url, parse, key, { key: "member:1:0", ready: true, getToken: async () => "token" }), { wrapper });
  await waitFor(() => expect(result.current.state.data.map(key)).toEqual(["mine"]));
  expect(fetcher).toHaveBeenCalledTimes(1);
});
