import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useNewsSource } from "./use-news-source";

afterEach(() => vi.unstubAllGlobals());

// 11/17: member reads send the "kyaa-session" bearer; the real session is the __Host- cookie, so the read must carry same-origin cookies.
it("sends same-origin cookies with a member read so the fan session cookie reaches the server", async () => {
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 }));
  vi.stubGlobal("fetch", fetcher);
  const parse = (body: unknown) => body as { items: string[]; nextCursor: string | null };
  const key = (item: string) => item;
  const auth = { key: "member:p1:1", ready: true, getToken: async () => "kyaa-session" };
  const { result } = renderHook(() => useNewsSource("/api/celebrities/changha/media?locale=ko", parse, key, auth));
  await waitFor(() => expect(result.current.state.status).toBe("ready"));
  expect(fetcher).toHaveBeenCalledWith("/api/celebrities/changha/media?locale=ko", expect.objectContaining({ credentials: "same-origin", headers: { Authorization: "Bearer kyaa-session" } }));
});
