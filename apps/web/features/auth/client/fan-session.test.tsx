import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ privy: { ready: false, authenticated: false, user: null as null | { id: string }, getAccessToken: vi.fn(async () => "privy-token" as string | null), logout: vi.fn(async () => {}) } }));
vi.mock("@privy-io/react-auth", () => ({ usePrivy: () => mock.privy, useSubscribeToJwtAuthWithFlag: vi.fn() }));

import { useByUsAuth } from "./cognito-auth";
import { clearFanSession, FAN_SESSION_BEARER, readFanSessionHint, renewFanSession, withPrivyDeadline } from "./fan-session";
import { FanSessionKeeper } from "./fan-session-keeper";
import { render } from "@testing-library/react";

const hint = (pid = "did:privy:user-1", at = Date.now()) => localStorage.setItem("kyaa:fan-session", JSON.stringify({ pid, exp: Date.now() + 3600_000, at }));
const fetcher = vi.fn(async () => new Response(null, { status: 204 }));

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", fetcher);
  mock.privy = { ready: false, authenticated: false, user: null, getAccessToken: vi.fn(async () => "privy-token"), logout: vi.fn(async () => {}) };
});
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe("withPrivyDeadline", () => {
  it("answers with the cookie sentinel when Privy is slower than two seconds and a session exists", async () => {
    vi.useFakeTimers();
    hint();
    const token = withPrivyDeadline(() => new Promise(() => {}), "did:privy:user-1");
    await vi.advanceTimersByTimeAsync(2000);
    await expect(token).resolves.toBe(FAN_SESSION_BEARER);
  });

  it("waits for Privy as before without a session, or for a different user", async () => {
    vi.useFakeTimers();
    let release!: (value: string) => void;
    const slow = () => new Promise<string>((resolve) => { release = resolve; });
    const first = withPrivyDeadline(slow, "did:privy:user-1");
    await vi.advanceTimersByTimeAsync(5000);
    release("late-token");
    await expect(first).resolves.toBe("late-token");
    hint("did:privy:someone-else");
    const second = withPrivyDeadline(slow, "did:privy:user-1");
    await vi.advanceTimersByTimeAsync(5000);
    release("late-token-2");
    await expect(second).resolves.toBe("late-token-2");
  });

  it("returns Privy's token when it is on time", async () => {
    hint();
    await expect(withPrivyDeadline(async () => "privy-token", "did:privy:user-1")).resolves.toBe("privy-token");
  });
});

describe("renewFanSession", () => {
  it("renews at most every ten minutes and never with the sentinel or an email token", async () => {
    hint("did:privy:user-1", Date.now() - 60_000);
    renewFanSession("privy-token", "did:privy:user-1");
    renewFanSession(FAN_SESSION_BEARER, "did:privy:user-1");
    renewFanSession("kyaa-email:x", "did:privy:user-1");
    expect(fetcher).not.toHaveBeenCalled();
    hint("did:privy:user-1", Date.now() - 11 * 60_000);
    renewFanSession("privy-token", "did:privy:user-1");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("drops the session hint when the server refuses", async () => {
    hint("did:privy:user-1", 0);
    fetcher.mockResolvedValueOnce(new Response(null, { status: 403 }));
    renewFanSession("privy-token", "did:privy:user-1");
    await vi.waitFor(() => expect(readFanSessionHint()).toBeNull());
  });
});

describe("useByUsAuth while Privy is stalled", () => {
  it("keeps a fan with a session signed in after two seconds and sends the sentinel", async () => {
    vi.useFakeTimers();
    hint();
    const { result } = renderHook(() => useByUsAuth());
    expect(result.current.ready).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(result.current).toMatchObject({ ready: true, authenticated: true, user: { id: "did:privy:user-1" } });
    await expect(result.current.getAccessToken()).resolves.toBe(FAN_SESSION_BEARER);
    await act(async () => { await result.current.logout(); });
    expect(readFanSessionHint()).toBeNull();
  });

  it("caps a hanging Privy token at two seconds once Privy is loaded", async () => {
    vi.useFakeTimers();
    hint();
    mock.privy = { ...mock.privy, ready: true, authenticated: true, user: { id: "did:privy:user-1" }, getAccessToken: vi.fn(() => new Promise<string | null>(() => {})) };
    const { result } = renderHook(() => useByUsAuth());
    const token = result.current.getAccessToken();
    await vi.advanceTimersByTimeAsync(2000);
    await expect(token).resolves.toBe(FAN_SESSION_BEARER);
  });

  it("returns Privy's own object for a visitor without a session", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useByUsAuth());
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(result.current).toBe(mock.privy);
  });
});

describe("FanSessionKeeper", () => {
  it("issues the cookie with Privy's token while signed in", async () => {
    mock.privy = { ...mock.privy, ready: true, authenticated: true, user: { id: "did:privy:user-1" } };
    render(<FanSessionKeeper />);
    await vi.waitFor(() => expect(readFanSessionHint()?.pid).toBe("did:privy:user-1"));
    expect(fetcher).toHaveBeenCalledWith("/api/auth/fan-session", expect.objectContaining({ method: "POST", headers: { authorization: "Bearer privy-token" } }));
  });

  it("clears the session when Privy says nobody is signed in", async () => {
    hint();
    mock.privy = { ...mock.privy, ready: true, authenticated: false };
    render(<FanSessionKeeper />);
    expect(readFanSessionHint()).toBeNull();
    expect(fetcher).toHaveBeenCalledWith("/api/auth/fan-session", expect.objectContaining({ method: "DELETE" }));
  });

  it("does nothing on clear when there was no session", () => {
    clearFanSession();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
