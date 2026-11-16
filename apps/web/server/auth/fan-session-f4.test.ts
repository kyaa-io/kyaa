import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { TextEncoder as NodeTextEncoder } from "node:util";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// jsdom's Uint8Array is from another realm than Node's TextEncoder output, which jose refuses (same fix as privy-jwks.test.ts).
beforeAll(() => { Object.defineProperty(globalThis, "Uint8Array", { configurable: true, value: new NodeTextEncoder().encode("").constructor }); });

import { AuthError } from "../../features/auth/domain/auth-errors";
import { AppleLifecycleUnavailableError, AppleReauthenticationRequiredError } from "./apple-notifications/apple-lifecycle";
import {
  FAN_SESSION_COOKIE, fanSessionExpiry, fanSessionKey, fanSessionRevoked, openFanSession, sealFanSession, type FanSession,
} from "./fan-session-cookie";
import { createFanSessionRoute } from "./fan-session-route";
import { createPrivyTokenVerifier } from "./privy-jwks";
import { createPrivyNodeAccessVerifier } from "./privy-node-verifier";
import { PrivyUnavailableError } from "./privy-unavailable";
import { authorizeFanRequest } from "../fan-auth/fan-auth-gate";

const KEY = fanSessionKey(Buffer.alloc(32, 7).toString("base64"))!;
const NOW = Date.UTC(2026, 10, 12, 0, 0, 0);
const DAY = 86_400_000;
const UID = "11111111-1111-4111-8111-111111111111";
const config = { appId: "app-1", appSecret: "secret", appleLoginEnabled: false };
const privyUser = { id: "did:privy:user-1", linked_accounts: [{ type: "google_oauth", email: "fan@example.com", verified_at: 20, subject: "google-sub" }] };
const cookieOf = (value: FanSession) => `${FAN_SESSION_COOKIE}=${sealFanSession(value, KEY)}`;
function member(overrides: Partial<FanSession> = {}): FanSession {
  const iat = Math.floor(NOW / 1000);
  return {
    v: 2, sat: NOW, pid: "did:privy:user-1", sid: "s1", uid: UID, em: "fan@example.com",
    pa: [{ issuer: "https://accounts.google.com", subject: "google-sub" }], gl: true,
    apple: null, google: { subject: "google-sub", email: "fan@example.com" },
    iat, exp: iat + 30 * 86400, ...overrides,
  };
}
const fakePrivy = (claims: { iat?: number }, getUser: () => Promise<unknown> = async () => privyUser) => ({
  utils: () => ({ auth: () => ({ verifyAccessToken: vi.fn(async () => ({ app_id: "app-1", user_id: "did:privy:user-1", session_id: "s1", ...claims })) }) }),
  users: () => ({ _get: vi.fn(getUser) }),
}) as never;

afterEach(() => { vi.restoreAllMocks(); });

describe("F-2 clock tolerance for Privy token issue time", () => {
  async function signedAt(offsetSeconds: number) {
    const { publicKey, privateKey } = await generateKeyPair("ES256");
    const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "ES256" };
    const token = await new SignJWT({ sid: "s1" }).setProtectedHeader({ alg: "ES256", typ: "JWT", kid: "k1" }).setIssuer("privy.io").setAudience("app-1")
      .setSubject("did:privy:user-1").setIssuedAt(Math.floor(Date.now() / 1000) + offsetSeconds).setExpirationTime("2h").sign(privateKey);
    vi.spyOn(console, "info").mockImplementation(() => {});
    return createPrivyTokenVerifier("app-1", { fetcher: vi.fn(async () => Response.json({ keys: [jwk] })) })(token);
  }
  it("accepts a token Privy issued two seconds ahead of this server's clock and rejects one a few minutes ahead", async () => {
    await expect(signedAt(2)).resolves.toMatchObject({ user_id: "did:privy:user-1" });
    await expect(signedAt(120)).rejects.toThrow("Invalid Privy token issuance time");
  });

  it("applies the same tolerance when the verifier resolves a fan session, and stamps the cookie's sign-in no later than now", async () => {
    const verifier = (iat: number) => createPrivyNodeAccessVerifier(config, fakePrivy({ iat }), { sessionKey: KEY, now: () => NOW, readCookieHeader: async () => null });
    const ahead = await verifier(Math.floor(NOW / 1000) + 2).resolveFanSession("token");
    expect(ahead.tokenIssuedAt).toBe(NOW + 2000);
    await expect(verifier(Math.floor(NOW / 1000) + 120).resolveFanSession("token")).rejects.toThrow("Invalid Privy token issuance time");
    const route = createFanSessionRoute({
      appOrigin: "https://kyaa.io", key: KEY, now: () => NOW, resolve: async () => ahead, verifyCookie: vi.fn(), isPrivileged: async () => false, revokeSessions: vi.fn(),
      repository: { findUserByPrivyId: async () => ({ id: UID, privyUserId: "did:privy:user-1", verifiedEmail: "fan@example.com", status: "active" as const, sessionsValidAfter: null }) },
    });
    const response = await route.POST(new Request("https://kyaa.io/api/auth/fan-session", { method: "POST", headers: { origin: "https://kyaa.io", authorization: "Bearer privy-jwt" } }));
    expect(response.status).toBe(200);
    expect(openFanSession(response.headers.get("set-cookie")!.split(";")[0].split("=")[1], KEY, NOW)?.sat).toBe(NOW);
  });

  it("compares a sign-in with the revocation cutoff in whole seconds (F-9)", () => {
    const cutoff = new Date(NOW + 5500).toISOString();
    expect(fanSessionRevoked(NOW + 4000, cutoff)).toBe(true);
    expect(fanSessionRevoked(NOW + 5000, cutoff)).toBe(false);
    expect(fanSessionRevoked(NOW + 6000, cutoff)).toBe(false);
    expect(fanSessionRevoked(NOW, null)).toBe(false);
    expect(fanSessionRevoked(NOW, "not a date")).toBe(true);
  });
});

describe("F-3 the 90-day ceiling holds for protected APIs", () => {
  const gate = (clock: number, value: FanSession) => {
    const verifier = createPrivyNodeAccessVerifier(config, fakePrivy({}), { sessionKey: KEY, now: () => clock, readCookieHeader: async () => cookieOf(value) });
    const repository = { findUserByPrivyId: vi.fn(async () => ({ id: UID, privyUserId: "did:privy:user-1", verifiedEmail: "fan@example.com", status: "active" as const, sessionsValidAfter: null })) };
    return authorizeFanRequest({ authorization: "Bearer kyaa-session", verifier, repository });
  };
  // A cookie issued before the ceiling existed: its own 30 days run past sat + 90 days.
  const copied = (clock: number) => member({ iat: Math.floor((clock - DAY) / 1000), exp: Math.floor((clock - DAY) / 1000) + 30 * 86400 });

  it("serves a copied cookie on day 89 and refuses it on day 91", async () => {
    await expect(gate(NOW + 89 * DAY, copied(NOW + 89 * DAY))).resolves.toEqual({ appUserId: UID });
    await expect(gate(NOW + 91 * DAY, copied(NOW + 91 * DAY))).rejects.toMatchObject({ status: 401 });
  });

  it("refuses at exactly 90 days and not a millisecond before", async () => {
    await expect(gate(NOW + 90 * DAY - 1, copied(NOW + 90 * DAY - 1))).resolves.toEqual({ appUserId: UID });
    await expect(gate(NOW + 90 * DAY, copied(NOW + 90 * DAY))).rejects.toMatchObject({ status: 401 });
  });

  it("cuts a renewed cookie's expiry and Max-Age at sat + 90 days", async () => {
    const clock = NOW + 89 * DAY;
    const route = createFanSessionRoute({
      appOrigin: "https://kyaa.io", key: KEY, now: () => clock, resolve: vi.fn(), verifyCookie: vi.fn(async () => undefined), isPrivileged: async () => false, revokeSessions: vi.fn(),
      repository: { findUserByPrivyId: async () => ({ id: UID, privyUserId: "did:privy:user-1", verifiedEmail: "fan@example.com", status: "active" as const, sessionsValidAfter: null }) },
    });
    const response = await route.POST(new Request("https://kyaa.io/api/auth/fan-session", { method: "POST", headers: { origin: "https://kyaa.io", authorization: "Bearer kyaa-session", cookie: cookieOf(copied(clock)) } }));
    expect(response.status).toBe(200);
    const issuedAt = Math.floor(clock / 1000);
    const ceiling = Math.floor((NOW + 90 * DAY) / 1000);
    expect(openFanSession(response.headers.get("set-cookie")!.split(";")[0].split("=")[1], KEY, clock)).toMatchObject({ sat: NOW, iat: issuedAt, exp: ceiling });
    expect(response.headers.get("set-cookie")).toContain(`Max-Age=${ceiling - issuedAt};`);
    expect(await response.json()).toMatchObject({ exp: ceiling * 1000, authenticatedAt: NOW });
    expect(fanSessionExpiry(issuedAt, NOW + 29 * DAY)).toBe(issuedAt + 30 * 86400);
  });
});

describe("F-6 the exchange answers by kind of failure", () => {
  const post = (resolve: Parameters<typeof createFanSessionRoute>[0]["resolve"], extra: Record<string, unknown> = {}) => createFanSessionRoute({
    appOrigin: "https://kyaa.io", key: KEY, now: () => NOW, resolve, verifyCookie: vi.fn(), isPrivileged: async () => false, revokeSessions: vi.fn(),
    repository: { findUserByPrivyId: async () => ({ id: UID, privyUserId: "did:privy:user-1", verifiedEmail: "fan@example.com", status: "active" as const, sessionsValidAfter: null }) },
    ...extra,
  }).POST(new Request("https://kyaa.io/api/auth/fan-session", { method: "POST", headers: { origin: "https://kyaa.io", authorization: "Bearer privy-jwt", cookie: cookieOf(member()) } }));
  const cleared = (response: Response) => response.headers.get("set-cookie")?.includes("Max-Age=0") ?? false;

  it("503 and the cookie kept when Apple's state or Privy cannot be read", async () => {
    for (const error of [new AppleLifecycleUnavailableError(), new PrivyUnavailableError()]) {
      const response = await post(async () => { throw error; });
      expect([response.status, response.headers.get("set-cookie")]).toEqual([503, null]);
    }
  });

  it("403 and the cookie cleared when a provider must sign in again", async () => {
    const response = await post(async () => { throw new AppleReauthenticationRequiredError(["apple"]); });
    expect([response.status, cleared(response)]).toEqual([403, true]);
  });

  it("401 for a token that does not verify, leaving the existing cookie alone", async () => {
    for (const error of [new Error("expired"), new AuthError("AUTHENTICATION_REQUIRED", 401, "no")]) {
      const response = await post(async () => { throw error; });
      expect([response.status, response.headers.get("set-cookie") === null || cleared(response)]).toEqual([401, true]);
    }
    expect((await post(async () => { throw new Error("bad"); })).headers.get("set-cookie")).toBeNull();
  });

  it("a real verifier turns a Privy user-lookup timeout into 503 and a 4xx answer into 401", async () => {
    const run = (getUser: () => Promise<unknown>) => {
      const verifier = createPrivyNodeAccessVerifier(config, fakePrivy({ iat: Math.floor(NOW / 1000) }, getUser), { sessionKey: KEY, now: () => NOW, readCookieHeader: async () => null });
      return post((token) => verifier.resolveFanSession(token));
    };
    expect((await run(async () => { throw Object.assign(new Error("Request timed out"), { name: "APIConnectionTimeoutError" }); })).status).toBe(503);
    expect((await run(async () => { throw Object.assign(new Error("Bad gateway"), { status: 502 }); })).status).toBe(503);
    expect((await run(async () => { throw Object.assign(new Error("Not found"), { status: 404 }); })).status).toBe(401);
  });

  it("a real key-set fetch failure with no cached keys is 503, not a bad token", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const { privateKey } = await generateKeyPair("ES256");
    const token = await new SignJWT({ sid: "s1" }).setProtectedHeader({ alg: "ES256", typ: "JWT", kid: "k1" }).setIssuer("privy.io").setAudience("app-1")
      .setSubject("did:privy:user-1").setIssuedAt().setExpirationTime("1h").sign(privateKey);
    const verify = createPrivyTokenVerifier("app-1", { fetcher: vi.fn(async () => { throw new Error("network down"); }) });
    await expect(verify(token)).rejects.toBeInstanceOf(PrivyUnavailableError);
  });
});
