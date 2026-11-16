import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc }) }));

import { FAN_SESSION_COOKIE, fanSessionKey, sealFanSession, type FanSession } from "./fan-session-cookie";
import { createPrivyNodeAccessVerifier } from "./privy-node-verifier";
import { authorizeFanRequest } from "../fan-auth/fan-auth-gate";
import { createSongSearchHandler } from "../schedules/song-search-route";

// A protected API (song search) behind the real gate, verifier and Apple lifecycle repository. Only the database RPC and Privy's network are replaced.
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
  const search = vi.fn(async () => []);
  const handler = createSongSearchHandler({
    authorize: (authorization) => authorizeFanRequest({ authorization, verifier, repository }),
    rpc: vi.fn(async () => null), search,
  });
  const get = () => handler(new Request("https://kyaa.io/api/music/search?slug=event&q=IU", { headers: { authorization: "Bearer kyaa-session", ...(cookie ? { cookie } : {}) } }));
  return { get, repository, search };
}
const sealed = (value: FanSession = member) => `${FAN_SESSION_COOKIE}=${sealFanSession(value, KEY)}`;

beforeEach(() => {
  vi.stubEnv("APPLE_LIFECYCLE_ENABLED", "true");
  vi.stubEnv("SUPABASE_URL", "https://database.example.com");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role");
  rpc.mockReset().mockResolvedValue({ data: allowed, error: null });
});
afterEach(() => vi.unstubAllEnvs());

describe("a protected API with the own-session cookie", () => {
  it("(a) answers 503 while the account state cannot be read, then 200 once it recovers", async () => {
    const { get, repository, search } = setup(sealed());
    rpc.mockResolvedValueOnce({ data: null, error: { message: "connection reset" } });
    const outage = await get();
    expect(outage.status).toBe(503);
    expect(outage.headers.get("set-cookie")).toBeNull();
    expect(repository.findUserByPrivyId).not.toHaveBeenCalled();
    expect(search).not.toHaveBeenCalled();

    const recovered = await get();
    expect(recovered.status).toBe(200);
    expect(search).toHaveBeenCalledTimes(1);
  });

  it("answers 503 when the RPC call throws or answers in an unexpected shape", async () => {
    const { get } = setup(sealed());
    rpc.mockRejectedValueOnce(new Error("socket hang up"));
    expect((await get()).status).toBe(503);
    rpc.mockResolvedValueOnce({ data: { allowed: "yes" }, error: null });
    expect((await get()).status).toBe(503);
    expect((await get()).status).toBe(200);
  });

  it("(b) keeps reauthentication at 403 when the account is really revoked", async () => {
    const { get, repository, search } = setup(sealed());
    rpc.mockResolvedValue({ data: revoked, error: null });
    const response = await get();
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: { code: "APPLE_REAUTHENTICATION_REQUIRED" } });
    expect(repository.findUserByPrivyId).not.toHaveBeenCalled();
    expect(search).not.toHaveBeenCalled();
  });

  it("(c) keeps 401 for a forged, expired or missing cookie, without asking the database", async () => {
    for (const cookie of [
      `${FAN_SESSION_COOKIE}=${sealFanSession(member, KEY).slice(0, -4)}AAAA`,
      sealed({ ...member, iat: member.iat - 7200, exp: Math.floor(NOW / 1000) - 3600 }),
      null,
    ]) {
      const response = await setup(cookie).get();
      expect(response.status).toBe(401);
    }
    expect(rpc).not.toHaveBeenCalled();
  });
});
