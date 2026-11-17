import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearFanSession, FAN_SESSION_BEARER, FAN_SESSION_REQUEST_TIMEOUT_MS, readFanSessionHint, renewFanSession, RECHECK_AFTER_MS } from "./fan-session";
const pid = "did:privy:fan";
const hint = (at = Date.now()) => localStorage.setItem("kyaa:fan-session", JSON.stringify({ pid, exp: Date.now() + 3600_000, at }));
const fetcher = vi.fn();
beforeEach(() => { localStorage.clear(); vi.stubGlobal("fetch", fetcher); fetcher.mockImplementation(async () => Response.json({ session: true, exp: Date.now() + 30 * 86400_000, authenticatedAt: Date.now() })); });
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });
describe("fan session maintenance", () => {
  it("issues with Privy when no hint exists and records server expiry", async () => {
    const token = vi.fn(async () => "privy");
    await renewFanSession(token, pid);
    expect(token).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0][1].headers.authorization).toBe("Bearer privy");
    expect(readFanSessionHint()?.pid).toBe(pid);
  });
  it("renews with only the cookie and does not call Privy before daily proof refresh", async () => {
    hint(); const token = vi.fn(async () => "privy");
    await renewFanSession(token, pid);
    expect(fetcher.mock.calls[0][1].headers.authorization).toBe(`Bearer ${FAN_SESSION_BEARER}`);
    expect(token).not.toHaveBeenCalled();
  });
  it("checks Privy daily after renewing the cookie", async () => {
    hint(Date.now() - RECHECK_AFTER_MS - 1);
    await renewFanSession(async () => "privy", pid);
    expect(fetcher.mock.calls.map((call) => call[1].headers.authorization)).toEqual(["Bearer kyaa-session", "Bearer privy"]);
  });
  it("falls back to fresh Privy proof after a rejected renewal", async () => {
    hint(); fetcher.mockResolvedValueOnce(new Response(null, { status: 401 }));
    await renewFanSession(async () => "privy", pid);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(readFanSessionHint()?.pid).toBe(pid);
  });
  it("preserves an existing session during a Privy outage", async () => {
    hint(Date.now() - RECHECK_AFTER_MS - 1);
    await renewFanSession(async () => { throw new Error("offline"); }, pid);
    expect(readFanSessionHint()?.pid).toBe(pid);
  });
  it("never reissues from a delayed Privy call after logout", async () => {
    let release!: (token: string) => void;
    const operation = renewFanSession(() => new Promise((resolve) => { release = resolve; }), pid);
    await Promise.resolve(); await clearFanSession(); release("privy"); await operation;
    expect(readFanSessionHint()).toBeNull();
    expect(fetcher.mock.calls.map((call) => call[1].method)).toEqual(["DELETE"]);
  });
});
it("does not reuse an old owner's pending Privy call after switching accounts", async () => {
  let release!: (token: string) => void;
  const old = renewFanSession(() => new Promise((resolve) => { release = resolve; }), "did:privy:old");
  await Promise.resolve();
  await renewFanSession(async () => "new-token", "did:privy:new");
  release("old-token"); await old;
  expect(readFanSessionHint()?.pid).toBe("did:privy:new");
  expect(fetcher.mock.calls.map((call) => call[1].headers.authorization)).toEqual(["Bearer new-token"]);
});

it("preserves a valid renewed cookie hint when background Privy proof returns 401", async () => {
  hint(Date.now() - RECHECK_AFTER_MS - 1);
  fetcher.mockResolvedValueOnce(Response.json({ session: true, exp: Date.now() + 30 * 86400_000, authenticatedAt: Date.now() - RECHECK_AFTER_MS - 1 }));
  fetcher.mockResolvedValueOnce(new Response(null, { status: 401 }));
  await renewFanSession(async () => "privy-jwt", pid);
  expect(fetcher.mock.calls.map((call) => call[1].headers.authorization)).toEqual(["Bearer kyaa-session", "Bearer privy-jwt"]);
  expect(readFanSessionHint()?.pid).toBe(pid);
});

describe("renewal that stops answering", () => {
  const stall = (signal: AbortSignal) => new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))));
  afterEach(() => { vi.useRealTimers(); });

  it("gives up on a POST whose headers never arrive and keeps the hint (a)", async () => {
    vi.useFakeTimers(); hint();
    fetcher.mockImplementation((_url: string, init: RequestInit) => stall(init.signal!));
    const done = renewFanSession(async () => "privy", pid);
    await vi.advanceTimersByTimeAsync(FAN_SESSION_REQUEST_TIMEOUT_MS + 1);
    // The first request timed out; the same run then asks Privy for fresh proof, which also times out.
    await vi.advanceTimersByTimeAsync(FAN_SESSION_REQUEST_TIMEOUT_MS + 1);
    await done;
    expect(fetcher.mock.calls.every((call) => call[1].signal.aborted)).toBe(true);
    expect(readFanSessionHint()?.pid).toBe(pid);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("gives up on a body that stalls after the headers arrived (b)", async () => {
    vi.useFakeTimers(); hint();
    fetcher.mockImplementation(async (_url: string, init: RequestInit) => ({ ok: true, status: 200, json: () => stall(init.signal!) }));
    const done = renewFanSession(async () => null, pid);
    await vi.advanceTimersByTimeAsync(FAN_SESSION_REQUEST_TIMEOUT_MS + 1);
    await done;
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
    expect(readFanSessionHint()?.pid).toBe(pid);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps the hint when an error body stalls", async () => {
    vi.useFakeTimers(); hint();
    fetcher.mockImplementation(async (_url: string, init: RequestInit) => ({ ok: false, status: 401, json: () => stall(init.signal!) }));
    const done = renewFanSession(async () => null, pid);
    await vi.advanceTimersByTimeAsync(FAN_SESSION_REQUEST_TIMEOUT_MS + 1);
    await done;
    expect(readFanSessionHint()?.pid).toBe(pid);
  });

  it("aborts a stuck renewal on sign-out, waits for it to settle, then deletes (c, hint side)", async () => {
    hint();
    const order: string[] = [];
    fetcher.mockImplementation((_url: string, init: RequestInit) => {
      if (init.method === "DELETE") { order.push("delete"); return Promise.resolve(new Response(null, { status: 204 })); }
      order.push("post");
      return stall(init.signal!).catch((error) => { order.push("post-aborted"); throw error; });
    });
    const renewal = renewFanSession(async () => "privy", pid);
    await Promise.resolve();
    await clearFanSession();
    await renewal;
    expect(order).toEqual(["post", "post-aborted", "delete"]);
    expect(readFanSessionHint()).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not let a late renewal answer restore the hint after sign-out", async () => {
    hint();
    let answer!: () => void;
    // A fetch that ignores the signal still cannot write the hint: the generation check holds.
    fetcher.mockImplementation((_url: string, init: RequestInit) => init.method === "DELETE"
      ? Promise.resolve(new Response(null, { status: 204 }))
      : new Promise((resolve) => { answer = () => resolve(Response.json({ session: true, exp: Date.now() + 86400_000, authenticatedAt: Date.now() })); init.signal!.addEventListener("abort", () => answer()); }));
    const renewal = renewFanSession(async () => null, pid);
    await Promise.resolve();
    await clearFanSession(); await renewal;
    expect(readFanSessionHint()).toBeNull();
  });

  it("does not report sign-out when the delete never answers, and restores the hint for a retry", async () => {
    vi.useFakeTimers(); hint();
    fetcher.mockImplementation((_url: string, init: RequestInit) => stall(init.signal!));
    const result = clearFanSession().then(() => "done", (error: Error) => error.name);
    await vi.advanceTimersByTimeAsync(FAN_SESSION_REQUEST_TIMEOUT_MS + 1);
    expect(await result).toBe("AbortError");
    expect(readFanSessionHint()?.pid).toBe(pid);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps the hint through a 503 from the server (account state unavailable)", async () => {
    hint(); fetcher.mockResolvedValueOnce(new Response(null, { status: 503 }));
    await renewFanSession(async () => null, pid);
    expect(readFanSessionHint()?.pid).toBe(pid);
    expect(fetcher).toHaveBeenCalledOnce();
  });
});

describe("account unavailable (403 FAN_ACCOUNT_UNAVAILABLE)", () => {
  const gone = () => Response.json({ error: { code: "FAN_ACCOUNT_UNAVAILABLE" } }, { status: 403 });
  afterEach(async () => { fetcher.mockResolvedValue(new Response(null, { status: 204 })); await clearFanSession(); });

  it("stops after one request, drops the hint, and tells the page once", async () => {
    hint(); fetcher.mockImplementation(async () => gone());
    const heard = vi.fn(); window.addEventListener("kyaa:fan-account-unavailable", heard);
    const token = vi.fn(async () => "privy");
    await renewFanSession(token, pid);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(token).not.toHaveBeenCalled();
    expect(readFanSessionHint()).toBeNull();
    expect(heard).toHaveBeenCalledTimes(1);
    window.removeEventListener("kyaa:fan-account-unavailable", heard);
  });

  it("does not ask again on later page entries for the same account, until sign-out", async () => {
    fetcher.mockImplementation(async () => gone());
    await renewFanSession(async () => "privy", pid);
    await renewFanSession(async () => "privy", pid);
    await renewFanSession(async () => "privy", pid);
    expect(fetcher).toHaveBeenCalledTimes(1);
    fetcher.mockImplementation(async () => new Response(null, { status: 204 }));
    await clearFanSession();
    fetcher.mockImplementation(async () => Response.json({ session: true, exp: Date.now() + 30 * 86400_000, authenticatedAt: Date.now() }));
    await renewFanSession(async () => "privy", pid);
    expect(readFanSessionHint()?.pid).toBe(pid);
  });

  it("a plain 403 (provider must sign in again) or a 503 does not stop later attempts", async () => {
    fetcher.mockResolvedValueOnce(new Response(null, { status: 403 }));
    await renewFanSession(async () => "privy", pid);
    fetcher.mockResolvedValueOnce(new Response(null, { status: 503 }));
    await renewFanSession(async () => "privy", pid);
    await renewFanSession(async () => "privy", pid);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
