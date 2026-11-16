import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearFanSession, FAN_SESSION_BEARER, readFanSessionHint, renewFanSession, RECHECK_AFTER_MS } from "./fan-session";
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
