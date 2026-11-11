import "server-only";
import { createLocalJWKSet, jwtVerify, type JSONWebKeySet, type JWTVerifyGetKey } from "jose";
import { measurePrivyCall } from "./privy-latency";

// Privy access tokens are ES256 JWTs. We check them against the app's public keys held in this process, so a signed-in
// request does not wait on Privy. The key set is fetched once, refreshed hourly, and the last good set is kept when a refresh
// fails: an outage then rejects nothing that was valid before it started. An unknown key ID (Privy rotated keys) asks
// again at most once a minute.
const PRIVY_API = process.env.PRIVY_API_BASE_URL ?? "https://api.privy.io";
const REFRESH_AFTER_MS = 60 * 60_000;
const UNKNOWN_KID_COOLDOWN_MS = 60_000;
const FETCH_TIMEOUT_MS = 2_000;

export interface PrivyAccessClaims { app_id: string; user_id: string; session_id: string }

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
interface KeyState { keys: JWTVerifyGetKey | null; fetchedAt: number; lastAttempt: number; inflight: Promise<void> | null }
const states = new Map<string, KeyState>();

async function refresh(appId: string, state: KeyState, fetcher: Fetcher, now: () => number): Promise<void> {
  if (state.inflight) return state.inflight;
  state.lastAttempt = now();
  state.inflight = measurePrivyCall("jwks", async () => {
    const response = await fetcher(`${PRIVY_API}/v1/apps/${encodeURIComponent(appId)}/jwks.json`, {
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error("Privy key set unavailable");
    const body = await response.json() as JSONWebKeySet;
    if (!Array.isArray(body?.keys) || body.keys.length === 0) throw new Error("Privy key set is empty");
    state.keys = createLocalJWKSet(body);
    state.fetchedAt = now();
  }).catch((error: unknown) => { if (!state.keys) throw error; })
    .finally(() => { state.inflight = null; });
  return state.inflight;
}

export function createPrivyTokenVerifier(appId: string, options: { fetcher?: Fetcher; now?: () => number } = {}) {
  const fetcher = options.fetcher ?? ((url, init) => fetch(url, init));
  const now = options.now ?? Date.now;
  const state = options.fetcher ? { keys: null, fetchedAt: 0, lastAttempt: 0, inflight: null } satisfies KeyState
    : states.get(appId) ?? (() => { const created: KeyState = { keys: null, fetchedAt: 0, lastAttempt: 0, inflight: null }; states.set(appId, created); return created; })();

  const resolveKey: JWTVerifyGetKey = async (header, token) => {
    if (!state.keys) await refresh(appId, state, fetcher, now);
    else if (now() - state.fetchedAt > REFRESH_AFTER_MS && now() - state.lastAttempt > UNKNOWN_KID_COOLDOWN_MS) void refresh(appId, state, fetcher, now).catch(() => undefined);
    try {
      return await state.keys!(header, token);
    } catch (error) {
      if (now() - state.lastAttempt <= UNKNOWN_KID_COOLDOWN_MS) throw error;
      await refresh(appId, state, fetcher, now);
      return state.keys!(header, token);
    }
  };

  return async function verifyAccessToken(accessToken: string): Promise<PrivyAccessClaims> {
    const { payload } = await jwtVerify(accessToken, resolveKey, { typ: "JWT", algorithms: ["ES256"], issuer: "privy.io", audience: appId });
    if (typeof payload.sub !== "string" || typeof payload.sid !== "string" || typeof payload.aud !== "string") throw new Error("Invalid Privy access token");
    return { app_id: payload.aud, user_id: payload.sub, session_id: payload.sid };
  };
}
