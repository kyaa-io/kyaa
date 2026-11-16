import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pid = "did:privy:fan";
const SESSION_URL = "/api/auth/fan-session";
const sentinel = { headers: { authorization: "Bearer kyaa-session" } };
const hint = () => localStorage.setItem("kyaa:fan-session", JSON.stringify({ pid, exp: Date.now() + 3600_000, at: Date.now() }));
const fresh = () => Response.json({ session: true, exp: Date.now() + 30 * 86400_000, authenticatedAt: Date.now() });

// Each test gets its own module state: the cooldown and the active owner are module-level.
async function load() {
  vi.resetModules();
  const module = await import("./fan-session");
  const api = vi.fn(async () => new Response(null, { status: 401 }));
  const exchange = vi.fn(async () => fresh());
  const fetcher = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => String(input) === SESSION_URL ? exchange() : api());
  vi.stubGlobal("fetch", fetcher);
  const getPrivyToken = vi.fn(async () => "privy-jwt");
  hint();
  const stop = module.watchFanSessionLoss(getPrivyToken, pid);
  await module.renewFanSession(getPrivyToken, pid); // the keeper's page-entry renewal
  exchange.mockClear(); getPrivyToken.mockClear(); fetcher.mockClear();
  const exchanges = () => exchange.mock.calls.length;
  return { ...module, api, exchange, fetcher, getPrivyToken, stop, exchanges };
}
beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("a protected API answers 401 to the own-session sentinel (cookie died under an open tab)", () => {
  it("drops the hint, takes a new cookie from Privy once, and hands the original 401 back unchanged", async () => {
    const f = await load();
    const response = await fetch("/api/music/search", sentinel);
    expect(response.status).toBe(401);
    await vi.waitFor(() => expect(f.exchanges()).toBe(1));
    expect(f.exchange.mock.calls).toHaveLength(1);
    const exchangeCall = f.fetcher.mock.calls.find((call) => String(call[0]) === SESSION_URL)!;
    expect((exchangeCall[1] as RequestInit).headers).toEqual({ authorization: "Bearer privy-jwt" });
    await vi.waitFor(() => expect(f.readFanSessionHint()?.pid).toBe(pid));
    expect(f.getPrivyToken).toHaveBeenCalledTimes(1);
  });

  it("sends later requests with Privy while the new cookie is on its way", async () => {
    const f = await load();
    let release!: () => void;
    f.exchange.mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve(fresh()); }));
    await fetch("/api/music/search", sentinel);
    await vi.waitFor(() => expect(f.exchanges()).toBe(1));
    expect(f.readFanSessionHint()).toBeNull();
    release();
    await vi.waitFor(() => expect(f.readFanSessionHint()?.pid).toBe(pid));
  });

  it("runs one recovery for a burst of 401s and none again within the cooldown, so a server that keeps refusing cannot loop", async () => {
    const f = await load();
    await Promise.all([fetch("/api/a", sentinel), fetch("/api/b", sentinel), fetch("/api/c", sentinel)]);
    await vi.waitFor(() => expect(f.readFanSessionHint()?.pid).toBe(pid));
    expect(f.exchanges()).toBe(1);
    // The fresh cookie is refused again: the next 401 inside the cooldown does not start another round.
    await fetch("/api/d", sentinel);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(f.exchanges()).toBe(1);
    expect(f.getPrivyToken).toHaveBeenCalledTimes(1);
    // After the cooldown it may recover once more.
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + f.FAN_SESSION_RECOVERY_COOLDOWN_MS + 1);
    await fetch("/api/e", sentinel);
    await vi.waitFor(() => expect(f.exchanges()).toBe(2));
  });

  it("runs one recovery at a time even when one outlasts the cooldown", async () => {
    const f = await load();
    let release!: () => void;
    f.exchange.mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve(new Response(null, { status: 503 })); }));
    await fetch("/api/a", sentinel);
    await vi.waitFor(() => expect(f.exchanges()).toBe(1));
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + f.FAN_SESSION_RECOVERY_COOLDOWN_MS + 1);
    f.api.mockResolvedValueOnce(new Response(null, { status: 401 }));
    await fetch("/api/b", sentinel);
    release();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(f.exchanges()).toBe(1);
  });

  it("ignores a 401 for a request sent before a renewal replaced the cookie", async () => {
    const f = await load();
    let release!: () => void;
    f.api.mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve(new Response(null, { status: 401 })); }));
    const slow = fetch("/api/slow", sentinel);
    await f.renewFanSession(f.getPrivyToken, pid); // runs the sentinel renewal and rewrites the hint
    f.exchange.mockClear(); f.getPrivyToken.mockClear();
    release(); await slow;
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(f.exchanges()).toBe(0);
    expect(f.getPrivyToken).not.toHaveBeenCalled();
    expect(f.readFanSessionHint()?.pid).toBe(pid);
  });

  it("does nothing after sign-out, and never revives the session", async () => {
    const f = await load();
    f.api.mockImplementationOnce(async () => { await f.clearFanSession(); return new Response(null, { status: 401 }); });
    await fetch("/api/music/search", sentinel);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(f.readFanSessionHint()).toBeNull();
    expect(f.getPrivyToken).not.toHaveBeenCalled();
  });
});

describe("what does not count as a dead cookie", () => {
  it("a 401 for a Privy token, a 403, a 503, or the exchange route itself starts nothing", async () => {
    const f = await load();
    await fetch("/api/music/search", { headers: { authorization: "Bearer privy-jwt" } });
    f.api.mockResolvedValueOnce(new Response(null, { status: 403 }));
    await fetch("/api/music/search", sentinel);
    f.api.mockResolvedValueOnce(new Response(null, { status: 503 }));
    await fetch("/api/music/search", sentinel);
    f.exchange.mockResolvedValueOnce(new Response(null, { status: 401 }));
    await fetch(SESSION_URL, { method: "POST", ...sentinel });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(f.getPrivyToken).not.toHaveBeenCalled();
  });

  it("stops watching and puts the original fetch back", async () => {
    const f = await load();
    const watched = window.fetch;
    f.stop();
    expect(window.fetch).not.toBe(watched);
    await fetch("/api/music/search", sentinel);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(f.getPrivyToken).not.toHaveBeenCalled();
  });
});

describe("FAN_SESSION_ISSUE=off: the server answers {session:false} to every exchange", () => {
  const refused = () => Response.json({ session: false });
  it("keeps the client on Privy tokens: no hint is written and a 401 to a Privy request starts no recovery", async () => {
    vi.resetModules();
    const f = await import("./fan-session");
    const api = vi.fn(async () => new Response(null, { status: 401 }));
    const exchange = vi.fn(async () => refused());
    const fetcher = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => String(input) === SESSION_URL ? exchange() : api());
    vi.stubGlobal("fetch", fetcher);
    const getPrivyToken = vi.fn(async () => "privy-jwt");
    const stop = f.watchFanSessionLoss(getPrivyToken, pid);
    await f.renewFanSession(getPrivyToken, pid);
    expect(exchange).toHaveBeenCalledTimes(1);
    expect(f.readFanSessionHint()).toBeNull();
    // privy-root.island.tsx sends the sentinel only while a hint exists, so with no hint every call carries the Privy token.
    expect((await fetch("/api/music/search", { headers: { authorization: "Bearer privy-jwt" } })).status).toBe(401);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(exchange).toHaveBeenCalledTimes(1);
    expect(getPrivyToken).toHaveBeenCalledTimes(1);
    expect(f.readFanSessionHint()).toBeNull();
    stop();
  });

  it("drops a hint left from before the switch and does not retry on its own", async () => {
    vi.resetModules();
    const f = await import("./fan-session");
    hint();
    const exchange = vi.fn(async () => refused());
    vi.stubGlobal("fetch", vi.fn(async () => exchange()));
    const getPrivyToken = vi.fn(async () => "privy-jwt");
    await f.renewFanSession(getPrivyToken, pid);
    expect(exchange).toHaveBeenCalledTimes(2); // the cookie renewal, then one Privy attempt; both refused
    expect(f.readFanSessionHint()).toBeNull();
    await f.renewFanSession(getPrivyToken, pid);
    expect(exchange).toHaveBeenCalledTimes(3); // the next page entry tries once with Privy, never a loop
  });
});
