import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { authenticatePrivyAccessToken } from "./authenticate-privy";
import {
  FAN_SESSION_BEARER,
  FAN_SESSION_COOKIE,
  fanSessionKey,
  openFanSession,
  sealFanSession,
  type FanSession,
} from "./fan-session-cookie";
import { createFanSessionRoute } from "./fan-session-route";
import { createPrivyNodeAccessVerifier } from "./privy-node-verifier";
import { measurePrivyCall } from "./privy-latency";
import { authorizeFanRequest } from "../fan-auth/fan-auth-gate";
import { authorizeAdminSession } from "../admin/admin-session-gate";
import { authorizeChannelSession } from "../operator/channel-operator-gate";

const SECRET = Buffer.alloc(32, 7).toString("base64");
const KEY = fanSessionKey(SECRET)!;
const NOW = Date.UTC(2026, 10, 12, 0, 0, 0);
const UID = "11111111-1111-4111-8111-111111111111";

function session(overrides: Partial<FanSession> = {}): FanSession {
  const iat = Math.floor(NOW / 1000);
  return {
    v: 1, pid: "did:privy:user-1", sid: "privy-session-1", uid: UID, em: "fan@example.com",
    pa: [{ issuer: "https://accounts.google.com", subject: "google-sub" }], gl: true,
    apple: null, google: { subject: "google-sub", email: "fan@example.com" },
    iat, exp: iat + 6 * 3600, ...overrides,
  };
}
const cookieHeader = (value: string) => `other=1; ${FAN_SESSION_COOKIE}=${value}`;

afterEach(() => { vi.restoreAllMocks(); });

describe("fan session cookie", () => {
  it("opens only what this key sealed, before it expires", () => {
    const sealed = sealFanSession(session(), KEY);
    expect(openFanSession(sealed, KEY, NOW)).toMatchObject({ pid: "did:privy:user-1", uid: UID });
    expect(openFanSession(sealed, KEY, NOW + 6 * 3600_000)).toBeNull();
    expect(openFanSession(sealed, fanSessionKey(Buffer.alloc(32, 8).toString("base64"))!, NOW)).toBeNull();
    const bytes = Buffer.from(sealed, "base64url"); bytes[bytes.length - 1] ^= 1;
    expect(openFanSession(bytes.toString("base64url"), KEY, NOW)).toBeNull();
    expect(openFanSession(sealFanSession(session({ exp: Math.floor(NOW / 1000) + 7 * 3600 }), KEY), KEY, NOW)).toBeNull();
  });

  it("derives its own key from AUTH_COOKIE_SECRET and is disabled without one", () => {
    expect(KEY.equals(Buffer.from(SECRET, "base64"))).toBe(false);
    expect(fanSessionKey(undefined)).toBeNull();
    expect(fanSessionKey("short")).toBeNull();
  });
});

describe("POST/DELETE /api/auth/fan-session", () => {
  const resolved = {
    privyUserId: "did:privy:user-1", sessionId: "privy-session-1", tokenIssuedAt: NOW,
    identity: { privyUserId: "did:privy:user-1", verifiedEmail: "fan@example.com", providerAccounts: [], googleLinked: true },
    apple: null, google: { subject: "google-sub", email: "fan@example.com" },
  };
  const active = { id: UID, privyUserId: "did:privy:user-1", verifiedEmail: "fan@example.com", status: "active" as const };
  const make = (overrides: Partial<Parameters<typeof createFanSessionRoute>[0]> = {}) => createFanSessionRoute({
    appOrigin: "https://kyaa.io", key: KEY, now: () => NOW,
    resolve: vi.fn(async () => resolved),
    verifyCookie: vi.fn(async () => undefined), isPrivileged: vi.fn(async () => false), revokeSessions: vi.fn(async () => undefined),
    repository: { findUserByPrivyId: vi.fn(async () => active) },
    ...overrides,
  });
  const request = (method: string, headers: Record<string, string>) => new Request("https://kyaa.io/api/auth/fan-session", { method, headers });

  it("issues an httpOnly, Strict, 30-day cookie for a real Privy token from our own origin", async () => {
    const response = await make().POST(request("POST", { origin: "https://kyaa.io", authorization: "Bearer privy-jwt" }));
    expect(response.status).toBe(200);
    const setCookie = response.headers.get("set-cookie")!;
    expect(setCookie).toMatch(/^__Host-kyaa-fan-session=[A-Za-z0-9_-]+; Path=\/; Max-Age=2592000; HttpOnly; Secure; SameSite=Strict$/);
    const value = setCookie.split(";")[0].split("=")[1];
    expect(openFanSession(value, KEY, NOW)).toMatchObject({ pid: "did:privy:user-1", sid: "privy-session-1", uid: UID, em: "fan@example.com" });
  });

  it("refuses another site, the cookie sentinel itself and email tokens", async () => {
    const route = make();
    expect((await route.POST(request("POST", { origin: "https://evil.example", authorization: "Bearer privy-jwt" }))).status).toBe(403);
    expect((await route.POST(request("POST", { origin: "https://kyaa.io", "sec-fetch-site": "cross-site", authorization: "Bearer privy-jwt" }))).status).toBe(403);
    expect((await route.POST(request("POST", { authorization: "Bearer privy-jwt" }))).status).toBe(403);
    expect((await route.POST(request("POST", { origin: "https://kyaa.io", authorization: `Bearer ${FAN_SESSION_BEARER}` }))).status).toBe(401);
    expect((await route.POST(request("POST", { origin: "https://kyaa.io", authorization: "Bearer kyaa-email:abc" }))).status).toBe(401);
    expect((await route.DELETE(request("DELETE", { origin: "https://evil.example" }))).status).toBe(403);
  });

  it("accepts the browser's own host when the app is served on a second host", async () => {
    const response = await make().POST(request("POST", { origin: "https://www.kyaa.io", host: "www.kyaa.io", authorization: "Bearer privy-jwt" }));
    expect(response.status).toBe(200);
  });

  it("clears the cookie instead of issuing one for a suspended, deleted or unknown member", async () => {
    for (const user of [{ ...active, status: "disabled" as const }, null]) {
      const response = await make({ repository: { findUserByPrivyId: vi.fn(async () => user) } })
        .POST(request("POST", { origin: "https://kyaa.io", authorization: "Bearer privy-jwt" }));
      expect(response.status).toBe(403);
      expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    }
  });

  it("answers 401 when the Privy token does not verify and 503 without a key", async () => {
    expect((await make({ resolve: vi.fn(async () => { throw new Error("bad"); }) })
      .POST(request("POST", { origin: "https://kyaa.io", authorization: "Bearer privy-jwt" }))).status).toBe(401);
    expect((await make({ key: null }).POST(request("POST", { origin: "https://kyaa.io", authorization: "Bearer privy-jwt" }))).status).toBe(503);
  });

  it("clears the cookie on sign-out", async () => {
    const response = await make().DELETE(request("DELETE", { origin: "https://kyaa.io" }));
    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toBe("__Host-kyaa-fan-session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict");
  });
});

describe("verifier without a Privy round trip on every request", () => {
  const config = { appId: "app-1", appSecret: "secret", appleLoginEnabled: false };
  const user = { id: "did:privy:user-1", linked_accounts: [{ type: "google_oauth", email: "fan@example.com", verified_at: 20, subject: "google-sub" }] };
  function client(getUser = vi.fn(async () => user)) {
    return { getUser, port: { utils: () => ({ auth: () => ({ verifyAccessToken: vi.fn(async () => ({ app_id: "app-1", user_id: "did:privy:user-1", session_id: "s1" })) }) }), users: () => ({ _get: getUser }) } };
  }

  it("asks Privy for the user once and serves later requests from memory", async () => {
    const { getUser, port } = client();
    const verifier = createPrivyNodeAccessVerifier(config, port, { sessionKey: KEY, readCookieHeader: async () => null });
    await verifier.verify("token-a");
    await verifier.verify("token-b");
    await createPrivyNodeAccessVerifier(config, port, { sessionKey: KEY, readCookieHeader: async () => null }).verify("token-c");
    expect(getUser).toHaveBeenCalledTimes(1);
    expect(getUser).toHaveBeenCalledWith("did:privy:user-1", { timeout: 2000, maxRetries: 0 });
  });

  it("goes on with the cookie's identity when Privy's user lookup fails for the same user", async () => {
    const { port } = client(vi.fn(async () => { throw new Error("timeout"); }));
    const sealed = sealFanSession(session({ iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 }), KEY);
    await expect(createPrivyNodeAccessVerifier(config, port, { sessionKey: KEY, readCookieHeader: async () => cookieHeader(sealed) }).verify("token"))
      .resolves.toMatchObject({ privyUserId: "did:privy:user-1", verifiedEmail: "fan@example.com" });
    const other = sealFanSession(session({ pid: "did:privy:someone-else", iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 }), KEY);
    const { port: port2 } = client(vi.fn(async () => { throw new Error("timeout"); }));
    await expect(createPrivyNodeAccessVerifier(config, port2, { sessionKey: KEY, readCookieHeader: async () => cookieHeader(other) }).verify("token")).rejects.toThrow("timeout");
  });

  it("accepts the sentinel only with a current cookie, and the fan gate still checks the member", async () => {
    const { getUser, port } = client();
    const fresh = sealFanSession(session({ iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 }), KEY);
    const withCookie = createPrivyNodeAccessVerifier(config, port, { sessionKey: KEY, readCookieHeader: async () => cookieHeader(fresh) });
    const repository = { findUserByPrivyId: vi.fn(async () => ({ id: UID, privyUserId: "did:privy:user-1", verifiedEmail: "fan@example.com", status: "active" as const })) };
    await expect(authorizeFanRequest({ authorization: `Bearer ${FAN_SESSION_BEARER}`, verifier: withCookie, repository })).resolves.toEqual({ appUserId: UID });
    expect(getUser).not.toHaveBeenCalled();
    repository.findUserByPrivyId.mockResolvedValueOnce({ id: UID, privyUserId: "did:privy:user-1", verifiedEmail: "fan@example.com", status: "suspended" as never });
    await expect(authorizeFanRequest({ authorization: `Bearer ${FAN_SESSION_BEARER}`, verifier: withCookie, repository })).rejects.toMatchObject({ status: 403 });
    repository.findUserByPrivyId.mockResolvedValueOnce(null as never);
    await expect(authorizeFanRequest({ authorization: `Bearer ${FAN_SESSION_BEARER}`, verifier: withCookie, repository })).rejects.toMatchObject({ status: 403 });
    const without = createPrivyNodeAccessVerifier(config, port, { sessionKey: KEY, readCookieHeader: async () => null });
    await expect(authenticatePrivyAccessToken(FAN_SESSION_BEARER, without)).rejects.toMatchObject({ status: 401 });
    const expired = sealFanSession(session(), KEY);
    const old = createPrivyNodeAccessVerifier(config, port, { sessionKey: KEY, readCookieHeader: async () => cookieHeader(expired), now: () => NOW + 7 * 3600_000 });
    await expect(authenticatePrivyAccessToken(FAN_SESSION_BEARER, old)).rejects.toMatchObject({ status: 401 });
  });

  it("never lets the cookie renew itself", async () => {
    const { port } = client();
    await expect(createPrivyNodeAccessVerifier(config, port, { sessionKey: KEY }).resolveFanSession(FAN_SESSION_BEARER)).rejects.toThrow();
  });

  it("keeps admin and operator gates on live Privy tokens", async () => {
    const verify = vi.fn();
    await expect(authorizeAdminSession({ authorization: `Bearer ${FAN_SESSION_BEARER}`, correlationId: "c", verifier: { verify }, repository: {} as never })).rejects.toMatchObject({ status: 401 });
    await expect(authorizeChannelSession({ authorization: `Bearer ${FAN_SESSION_BEARER}`, correlationId: "c", celebrityId: null, verifier: { verify }, repository: {} as never })).rejects.toMatchObject({ status: 401 });
    expect(verify).not.toHaveBeenCalled();
  });
});

describe("privy_latency log", () => {
  it("logs every call and warns past three seconds", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let t = 0;
    await measurePrivyCall("users.get", async () => { t = 3_500; return 1; }, () => t);
    expect(JSON.parse(info.mock.calls[0][0] as string)).toEqual({ event: "privy_latency", call: "users.get", ms: 3500, outcome: "ok" });
    expect(JSON.parse(warn.mock.calls[0][0] as string)).toEqual({ event: "privy_latency_slow", call: "users.get", ms: 3500, outcome: "ok" });
    t = 0;
    await expect(measurePrivyCall("jwks", async () => { t = 100; throw new Error("x"); }, () => t)).rejects.toThrow("x");
    expect(JSON.parse(info.mock.calls[1][0] as string)).toMatchObject({ call: "jwks", ms: 100, outcome: "error" });
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("sliding fan session security", () => {
  const DAY = 86400_000;
  const active = { id: UID, privyUserId: "did:privy:user-1", verifiedEmail: "fan@example.com", status: "active" as const, sessionsValidAfter: null as string | null };
  const fresh = () => session({ v: 2, sat: NOW, exp: Math.floor(NOW / 1000) + 30 * 86400 });
  const req = (value: FanSession, method = "POST") => new Request("https://kyaa.io/api/auth/fan-session", { method, headers: { origin: "https://kyaa.io", authorization: "Bearer kyaa-session", cookie: cookieHeader(sealFanSession(value, KEY)) } });
  function setup(clock = NOW) {
    const user = { ...active };
    const resolve = vi.fn(); const verifyCookie = vi.fn(async () => undefined);
    const isPrivileged = vi.fn(async () => false);
    const repository = { findUserByPrivyId: vi.fn(async () => user) };
    const route = createFanSessionRoute({ appOrigin: "https://kyaa.io", key: KEY, now: () => clock, resolve, verifyCookie, isPrivileged, repository,
      revokeSessions: async (_, timestamp) => { user.sessionsValidAfter = timestamp; },
    });
    return { route, resolve, verifyCookie, isPrivileged, user, repository };
  }
  it("renews at day 29 to another 30 days without Privy and preserves original proof", async () => {
    const { route, resolve, verifyCookie } = setup(NOW + 29 * DAY);
    const response = await route.POST(req(fresh()));
    expect(response.status).toBe(200);
    const opened = openFanSession(response.headers.get("set-cookie")!.split(";")[0].split("=")[1], KEY, NOW + 29 * DAY);
    expect(opened).toMatchObject({ sat: NOW, iat: Math.floor((NOW + 29 * DAY) / 1000), exp: Math.floor((NOW + 59 * DAY) / 1000) });
    expect(resolve).not.toHaveBeenCalled(); expect(verifyCookie).toHaveBeenCalledOnce();
    expect(openFanSession(sealFanSession(fresh(), KEY), KEY, NOW + 30 * DAY)).toBeNull();
  });
  it("requires fresh proof after 90 days but leaves the still-valid cookie intact", async () => {
    const clock = NOW + 91 * DAY;
    const { route } = setup(clock);
    const value = fresh(); value.iat = Math.floor((clock - DAY) / 1000); value.exp = value.iat + 30 * 86400;
    const response = await route.POST(req(value));
    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await response.json()).toMatchObject({ error: { code: "PRIVY_PROOF_REQUIRED" } });
    expect(openFanSession(sealFanSession(value, KEY), KEY, clock)).not.toBeNull();
  });
  it("accepts v1 reads but requires a fresh token to renew", async () => {
    const value = session(); const { route } = setup();
    expect(openFanSession(sealFanSession(value, KEY), KEY, NOW)).not.toBeNull();
    expect((await route.POST(req(value))).status).toBe(401);
  });
  it("rejects re-exchange of pre-logout Privy proof and accepts later proof", async () => {
    const { route, resolve } = setup(NOW + 500);
    const proof = { privyUserId: fresh().pid, sessionId: fresh().sid, tokenIssuedAt: NOW,
      identity: { privyUserId: fresh().pid, verifiedEmail: fresh().em, providerAccounts: [] }, apple: null, google: null };
    resolve.mockResolvedValue(proof);
    const exchange = () => route.POST(new Request("https://kyaa.io/api/auth/fan-session", { method: "POST", headers: { origin: "https://kyaa.io", authorization: "Bearer same-token" } }));
    expect((await exchange()).status).toBe(200);
    expect((await route.DELETE(req(fresh(), "DELETE"))).status).toBe(204);
    expect((await exchange()).status).toBe(401);
    resolve.mockResolvedValue({ ...proof, tokenIssuedAt: NOW + 500 });
    expect((await exchange()).status).toBe(401);
    resolve.mockResolvedValue({ ...proof, tokenIssuedAt: undefined });
    expect((await exchange()).status).toBe(401);
    resolve.mockResolvedValue({ ...proof, tokenIssuedAt: NOW + 1000 });
    expect((await exchange()).status).toBe(401); // future proof is invalid
    const later = setup(NOW + 2000);
    later.user.sessionsValidAfter = new Date(NOW + 500).toISOString();
    later.resolve.mockResolvedValue({ ...proof, tokenIssuedAt: NOW + 1000 });
    expect((await later.route.POST(new Request("https://kyaa.io/api/auth/fan-session", { method: "POST", headers: { origin: "https://kyaa.io", authorization: "Bearer new-token" } }))).status).toBe(200);
  });
  it("revokes copied cookies on logout for both renewals and fan requests", async () => {
    const { route, repository } = setup(NOW);
    const copied = fresh();
    expect((await route.DELETE(req(copied, "DELETE"))).status).toBe(204);
    expect((await route.POST(req(copied))).status).toBe(401);
    const verifier = { verify: async () => ({ privyUserId: copied.pid, verifiedEmail: copied.em, providerAccounts: copied.pa,
      fanSession: { appUserId: copied.uid, authenticatedAt: copied.sat! } }) };
    await expect(authorizeFanRequest({ authorization: "Bearer kyaa-session", verifier, repository })).rejects.toMatchObject({ status: 401 });
  });
  it("rejects uid mismatch and revoked proof at both gates", async () => {
    const value = fresh(); value.uid = "22222222-2222-4222-8222-222222222222";
    const { route, repository } = setup();
    expect((await route.POST(req(value))).status).toBe(401);
    await expect(authorizeFanRequest({ authorization: "Bearer kyaa-session", repository, verifier: { verify: async () => ({ privyUserId: value.pid, verifiedEmail: value.em, providerAccounts: [], fanSession: { appUserId: value.uid, authenticatedAt: NOW } }) } })).rejects.toMatchObject({ status: 401 });
  });
  it("clears an existing cookie for privileged accounts and fails closed on privilege lookup errors", async () => {
    const { route, isPrivileged } = setup();
    isPrivileged.mockResolvedValueOnce(true);
    const denied = await route.POST(req(fresh()));
    expect(await denied.json()).toEqual({ session: false });
    expect(denied.headers.get("set-cookie")).toContain("Max-Age=0");
    isPrivileged.mockRejectedValueOnce(new Error("db unavailable"));
    expect((await route.POST(req(fresh()))).status).toBe(503);
  });
  it("keeps the cookie when logout revocation fails, allowing retry", async () => {
    const route = createFanSessionRoute({ appOrigin: "https://kyaa.io", key: KEY, now: () => NOW, resolve: vi.fn(), verifyCookie: vi.fn(), isPrivileged: vi.fn(), repository: { findUserByPrivyId: vi.fn() }, revokeSessions: async () => { throw new Error("db unavailable"); } });
    const response = await route.DELETE(req(fresh(), "DELETE"));
    expect(response.status).toBe(503); expect(response.headers.get("set-cookie")).toBeNull();
  });
});
