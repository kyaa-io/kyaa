import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useContentMutation } from "./use-content-mutation";

const auth = vi.hoisted(() => ({ ready: true, authenticated: true, user: { id: "owner" }, getAccessToken: vi.fn(async () => "token") }));
vi.mock("@privy-io/react-auth", () => ({ usePrivy: () => auth }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => ({ ready: true, ownerId: "owner", generation: 0 }) }));

it("posts a comment without throwIfAborted and still stops after unmount", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(AbortSignal.prototype, "throwIfAborted");
  delete (AbortSignal.prototype as { throwIfAborted?: unknown }).throwIfAborted;
  const fetcher = vi.fn().mockResolvedValue(Response.json({ id: "comment" }));
  vi.stubGlobal("fetch", fetcher);
  try {
    const { result, unmount } = renderHook(() => useContentMutation("en"));
    await act(async () => { expect(await result.current.request("/api/comments", "POST", { text: "hello" })).toEqual({ id: "comment" }); });
    expect(fetcher).toHaveBeenCalledTimes(1);
    let release!: (value: string) => void;
    auth.getAccessToken.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    let pending!: Promise<unknown>;
    act(() => { pending = result.current.request("/api/comments", "POST", { text: "late" }); });
    unmount(); release("token");
    await expect(pending).resolves.toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  } finally {
    vi.unstubAllGlobals();
    if (descriptor) Object.defineProperty(AbortSignal.prototype, "throwIfAborted", descriptor);
  }
});
