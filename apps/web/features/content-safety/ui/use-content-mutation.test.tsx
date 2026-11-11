import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useContentMutation } from "./use-content-mutation";

const auth = vi.hoisted(() => ({ ready: true, authenticated: true, user: { id: "owner" }, getAccessToken: vi.fn(async () => "token") }));
vi.mock("@/features/auth/client/auth-fallback", () => ({ usePrivy: () => auth }));
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

it("tells an expired sign-in apart and asks to sign in again", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 }));
  vi.stubGlobal("fetch", fetcher);
  try {
    const { result } = renderHook(() => useContentMutation("ko"));
    await act(async () => { expect(await result.current.request("/api/comments", "POST", { text: "hello" })).toBeNull(); });
    expect(result.current.failure).toBe("auth");
    expect(result.current.error).toBe("로그인이 만료됐어요. 다시 로그인해 주세요.");
    auth.getAccessToken.mockResolvedValueOnce(null as unknown as string);
    fetcher.mockClear();
    await act(async () => { await result.current.request("/api/comments", "POST", { text: "hello" }); });
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.current.failure).toBe("auth");
  } finally { vi.unstubAllGlobals(); }
});

it("says the connection dropped when the request cannot reach the server", async () => {
  const fetcher = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
  vi.stubGlobal("fetch", fetcher);
  try {
    const { result } = renderHook(() => useContentMutation("ko"));
    await act(async () => { expect(await result.current.request("/api/comments", "POST", { text: "hello" })).toBeNull(); });
    expect(result.current.failure).toBe("offline");
    expect(result.current.error).toBe("인터넷 연결이 끊겨 처리하지 못했어요. 연결을 확인하고 다시 시도해 주세요.");
    fetcher.mockResolvedValueOnce(Response.json({ error: { code: "UNAVAILABLE" } }, { status: 503 }));
    await act(async () => { await result.current.request("/api/comments", "POST", { text: "hello" }); });
    expect(result.current.failure).toBeNull();
    expect(result.current.error).toBe("처리하지 못했어요. 다시 시도해 주세요.");
  } finally { vi.unstubAllGlobals(); }
});

it("drops the offline line once the browser is back online, not before (M4-2)", async () => {
  const fetcher = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
  vi.stubGlobal("fetch", fetcher);
  const onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  try {
    const { result } = renderHook(() => useContentMutation("ko"));
    act(() => { window.dispatchEvent(new Event("offline")); });
    await act(async () => { expect(await result.current.request("/api/posts/x/like", "PUT", { reaction: "like" })).toBeNull(); });
    expect(result.current.failure).toBe("offline");
    expect(result.current.error).toBe("인터넷 연결이 끊겨 처리하지 못했어요. 연결을 확인하고 다시 시도해 주세요.");
    onLine.mockReturnValue(true);
    act(() => { window.dispatchEvent(new Event("online")); });
    expect(result.current.failure).toBeNull();
    expect(result.current.error).toBe("");
  } finally { onLine.mockRestore(); vi.unstubAllGlobals(); }
});
