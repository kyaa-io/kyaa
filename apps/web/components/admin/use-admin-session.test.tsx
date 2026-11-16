import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAdminSession } from "./use-admin-session";

const getAccessToken = vi.fn();
const getPrivyAccessToken = vi.fn();
let sentinelHolder = false;
let privyState: { ready: boolean; authenticated: boolean; user?: { id: string } } = { ready: true, authenticated: true };

vi.mock("@/features/auth/client/auth-fallback", () => ({
  usePrivy: () => ({ ...privyState, getAccessToken, ...(sentinelHolder ? { getPrivyAccessToken } : {}) }),
}));

describe("useAdminSession", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    privyState = { ready: true, authenticated: true };
    sentinelHolder = false;
    getAccessToken.mockResolvedValue("privy-access-token");
    getPrivyAccessToken.mockResolvedValue("privy-access-token");
  });

  it("never sends the own-session sentinel: a fan promoted to admin with a live cookie enters on the first request", async () => {
    sentinelHolder = true;
    getAccessToken.mockResolvedValue("kyaa-session");
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ admin: { email: "biz@sallylab.io", role: "admin" } }), { status: 200, headers: { "content-type": "application/json" } }));
    const { result } = renderHook(() => useAdminSession());
    await waitFor(() => expect(result.current.status).toBe("authorized"));
    expect(fetchMock.mock.calls.map((call) => (call[1] as RequestInit).headers)).toEqual([{ authorization: "Bearer privy-access-token" }, { authorization: "Bearer privy-access-token" }]);
    expect(getAccessToken).not.toHaveBeenCalled();
  });

  it("sends the Privy bearer token and exposes only a validated 200 session", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        admin: { email: "biz@sallylab.io", role: "admin" },
      }), { status: 200, headers: { "content-type": "application/json" } }));

    const { result } = renderHook(() => useAdminSession());
    await waitFor(() => expect(result.current.status).toBe("authorized"));

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/auth/session", expect.objectContaining({
      method: "POST",
      headers: { authorization: "Bearer privy-access-token" },
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/admin/session", expect.objectContaining({
      method: "GET",
      headers: { authorization: "Bearer privy-access-token" },
      cache: "no-store",
    }));
  });

  it("fails closed when the server rejects the account", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "FORBIDDEN" } }), { status: 403 }));

    const { result } = renderHook(() => useAdminSession());
    await waitFor(() => expect(result.current.status).toBe("denied"));
  });

  it("does not call the server before Privy authentication", async () => {
    privyState = { ready: true, authenticated: false };
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const { result } = renderHook(() => useAdminSession());
    await waitFor(() => expect(result.current.status).toBe("unauthenticated"));
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("hides previous authorization immediately when the signed-in owner changes", async () => {
    privyState.user = { id: "owner-a" };
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(Response.json({ admin: { email: "a@example.test", role: "admin" } }))
      .mockImplementation(() => new Promise(() => {}));
    const { result, rerender } = renderHook(() => useAdminSession());
    await waitFor(() => expect(result.current.status).toBe("authorized"));
    privyState.user = { id: "owner-b" }; rerender();
    expect(result.current.status).toBe("loading");
    privyState.authenticated = false; rerender();
    expect(result.current.status).toBe("unauthenticated");
  });

});
