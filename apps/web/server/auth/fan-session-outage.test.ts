import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc }) }));

import { FAN_SESSION_COOKIE, fanSessionKey, sealFanSession, type FanSession } from "./fan-session-cookie";
import { createFanSessionRoute } from "./fan-session-route";
import { createPrivyNodeAccessVerifier } from "./privy-node-verifier";

// The real route, the real verifier and the real Apple lifecycle repository; only the database RPC and Privy's network are replaced.
const KEY = fanSessionKey(Buffer.alloc(32, 9).toString("base64"))!;
const NOW = Date.UTC(2026, 10, 16, 0, 0, 0);
const UID = "11111111-1111-4111-8111-111111111111";
const allowed = { allowed: true, generation: 1, appleState: null, appleRecoveryAllowed: false, googleRecoveryAllowed: false };
const revoked = { allowed: false, generation: 2, appleState: "revoked", appleRecoveryAllowed: true, googleRecoveryAllowed: true };
const member: FanSession = {
  v: 2, sat: NOW - 1000, pid: "did:privy:user-1", sid: "privy-session-1", uid: UID, em: "fan@example.com",
  pa: [{ issuer: "https://accounts.google.com", subject: "google-sub" }], gl: true,
  apple: null, google: { subject: "google-sub", email: "fan@example.com" },
  iat: Math.floor(NOW / 1000) - 10, exp: Math.floor(NOW / 1000) + 3600,
};
const privy = { utils: () => ({ auth: () => ({ verifyAccessToken: vi.fn() }) }), users: () => ({ _get: vi.fn() }) };

function setup(cookie: string | null) {
  const user = { id: UID, privyUserId: member.pid, verifiedEmail: "fan@example.com", status: "active" as const, sessionsValidAfter: null };
  const repository = { findUserByPrivyId: vi.fn(async () => user) };
  const verifier = createPrivyNodeAccessVerifier(
    { appId: "app-1", appSecret: "secret", appleLoginEnabled: true }, privy,
    { sessionKey: KEY, now: () => NOW, readCookieHeader: async () => cookie },
  );
  const route = createFanSessionRoute({
    appOrigin: "https://kyaa.io", key: KEY, now: () => NOW, resolve: vi.fn(), repository,
    verifyCookie: () => verifier.verify("kyaa-session"), isPrivileged: async () => false, revokeSessions: async () => undefined,
  });
  const post = () => route.POST(new Request("https://kyaa.io/api/auth/fan-session", {
    method: "POST", headers: { origin: "https://kyaa.io", authorization: "Bearer kyaa-session", ...(cookie ? { cookie } : {}) },
  }));
  return { post, repository };
}
const sealed = (value: FanSession = member) => `${FAN_SESSION_COOKIE}=${sealFanSession(value, KEY)}`;
const clearsCookie = (response: Response) => response.headers.get("set-cookie")?.includes("Max-Age=0") === true;

beforeEach(() => {
  vi.stubEnv("APPLE_LIFECYCLE_ENABLED", "true");
  vi.stubEnv("SUPABASE_URL", "https://database.example.com");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role");
  rpc.mockReset().mockResolvedValue({ data: allowed, error: null });
});
afterEach(() => vi.unstubAllEnvs());

describe("cookie renewal when the account state cannot be read", () => {
  it("(a) answers 503 without touching the cookie, then renews the same cookie once the lookup recovers", async () => {
    const { post, repository } = setup(sealed());
    rpc.mockResolvedValueOnce({ data: null, error: { message: "connection reset" } });
    const outage = await post();
    expect(outage.status).toBe(503);
    expect(outage.headers.get("set-cookie")).toBeNull();
    expect(repository.findUserByPrivyId).not.toHaveBeenCalled(); // not treated as a pass

    const recovered = await post();
    expect(recovered.status).toBe(200);
    expect(recovered.headers.get("set-cookie")).toContain(`${FAN_SESSION_COOKIE}=`);
    expect(clearsCookie(recovered)).toBe(false);
    expect(await recovered.json()).toMatchObject({ session: true, authenticatedAt: member.sat });
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("answers 503 and keeps the cookie when the RPC call itself throws or answers in an unexpected shape", async () => {
    const { post } = setup(sealed());
    rpc.mockRejectedValueOnce(new Error("socket hang up"));
    const thrown = await post();
    expect([thrown.status, thrown.headers.get("set-cookie")]).toEqual([503, null]);
    rpc.mockResolvedValueOnce({ data: { allowed: "yes" }, error: null });
    const malformed = await post();
    expect([malformed.status, malformed.headers.get("set-cookie")]).toEqual([503, null]);
  });

  it("(b) still rejects and clears the cookie for an account that is really revoked", async () => {
    const { post, repository } = setup(sealed());
    rpc.mockResolvedValue({ data: revoked, error: null });
    const response = await post();
    expect(response.status).toBe(403);
    expect(clearsCookie(response)).toBe(true);
    expect(repository.findUserByPrivyId).not.toHaveBeenCalled();
  });

  it("(c) still rejects and clears a forged, expired or missing cookie", async () => {
    const forged = setup(`${FAN_SESSION_COOKIE}=${sealFanSession(member, KEY).slice(0, -4)}AAAA`);
    const tampered = await forged.post();
    expect([tampered.status, clearsCookie(tampered)]).toEqual([401, true]);
    const expired = setup(sealed({ ...member, iat: member.iat - 7200, exp: Math.floor(NOW / 1000) - 3600 }));
    const old = await expired.post();
    expect([old.status, clearsCookie(old)]).toEqual([401, true]);
    // The route read a cookie but the verifier sees none (it expired in between): still a definite rejection.
    const racing = setup(sealed());
    const route = createFanSessionRoute({
      appOrigin: "https://kyaa.io", key: KEY, now: () => NOW, resolve: vi.fn(), repository: racing.repository, isPrivileged: async () => false, revokeSessions: async () => undefined,
      verifyCookie: () => createPrivyNodeAccessVerifier({ appId: "app-1", appSecret: "secret", appleLoginEnabled: true }, privy, { sessionKey: KEY, now: () => NOW, readCookieHeader: async () => null }).verify("kyaa-session"),
    });
    const gone = await route.POST(new Request("https://kyaa.io/api/auth/fan-session", { method: "POST", headers: { origin: "https://kyaa.io", authorization: "Bearer kyaa-session", cookie: sealed() } }));
    expect([gone.status, clearsCookie(gone)]).toEqual([401, true]);
    expect(rpc).not.toHaveBeenCalled();
  });
});
