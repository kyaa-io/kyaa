import "server-only";
import { AuthError } from "../../features/auth/domain/auth-errors";
import { mapPrivyIdentity } from "../../features/auth/domain/identity";
import { EMAIL_TOKEN_PREFIX } from "./email/email-auth";
import { AppleLifecycleUnavailableError } from "./apple-notifications/apple-lifecycle";
import { recordAuthDeniedReason, recordAuthDeniedReasonFromError } from "../observability/auth-denied-reason";
import { PrivyUnavailableError } from "./privy-unavailable";
import type { FanAuthRepository } from "../fan-auth/fan-auth-gate";
import type { ResolvedFanSession } from "./privy-node-verifier";
import {
  clearFanSessionCookieHeader, FAN_SESSION_BEARER, FAN_SESSION_CLOCK_SKEW_MS, FAN_SESSION_PROOF_MAX_MS,
  FanSessionRejectedError, fanSessionCookieHeader, fanSessionExpiry, fanSessionProofExpired, fanSessionRevoked, sealFanSession,
  openFanSession, readFanSessionCookie, type FanSession,
} from "./fan-session-cookie";

export interface FanSessionRouteDependencies {
  appOrigin: string;
  enabled?: boolean;
  key: Buffer | null;
  resolve(accessToken: string): Promise<ResolvedFanSession>;
  verifyCookie(): Promise<unknown>;
  isPrivileged(appUserId: string, email: string): Promise<boolean>;
  revokeSessions(appUserId: string, timestamp: string): Promise<void>;
  repository: FanAuthRepository;
  now?: () => number;
}
export const FAN_ACCOUNT_UNAVAILABLE = "FAN_ACCOUNT_UNAVAILABLE";
const headers = (cookie?: string) => {
  const result = new Headers({ "cache-control": "no-store", "referrer-policy": "no-referrer", vary: "Authorization, Cookie" });
  if (cookie) result.append("set-cookie", cookie);
  return result;
};
const reply = (status: number, cookie?: string) => new Response(null, { status, headers: headers(cookie) });
function sameOrigin(request: Request, appOrigin: string): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  if (origin === appOrigin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try { return host !== null && new URL(origin).host === host && new URL(origin).protocol === new URL(appOrigin).protocol; } catch { return false; }
}
/**
 * One answer per kind of failure. A failed lookup (Apple state, Privy) is 503 and keeps the cookie; a provider that must sign in again is 403;
 * anything else definite (revoked, forged, expired) is 401. `unexpected` is the status for an error we cannot classify.
 */
function failure(error: unknown, unexpected: Response): Response {
  if (error instanceof AppleLifecycleUnavailableError || error instanceof PrivyUnavailableError) return reply(503);
  if (error instanceof AuthError && error.status === 403) { recordAuthDeniedReasonFromError(error); return reply(403, clearFanSessionCookieHeader()); }
  if (error instanceof AuthError || error instanceof FanSessionRejectedError) return reply(401, clearFanSessionCookieHeader());
  return unexpected;
}
function bearer(request: Request): string | null {
  return /^Bearer[ \t]+([^\s]+)$/i.exec(request.headers.get("authorization")?.trim() ?? "")?.[1] ?? null;
}

export function createFanSessionRoute(deps: FanSessionRouteDependencies) {
  const now = deps.now ?? Date.now;
  const cookie = (request: Request) => deps.key ? openFanSession(readFanSessionCookie(request.headers.get("cookie")), deps.key, now()) : null;
  return {
    async POST(request: Request): Promise<Response> {
      if (!sameOrigin(request, deps.appOrigin)) { recordAuthDeniedReason("same_origin"); return reply(403); }
      if (deps.enabled === false) return Response.json({ session: false }, { headers: headers(clearFanSessionCookieHeader()) });
      if (!deps.key) return reply(503);
      const token = bearer(request);
      if (!token || token.startsWith(EMAIL_TOKEN_PREFIX)) return reply(401);
      let payload: Omit<FanSession, "uid" | "iat" | "exp">;
      const previous = token === FAN_SESSION_BEARER ? cookie(request) : null;
      if (token === FAN_SESSION_BEARER) {
        if (!previous || previous.v !== 2 || previous.sat === undefined) return reply(401, clearFanSessionCookieHeader());
        if (fanSessionProofExpired(previous, now())) return Response.json({ error: { code: "PRIVY_PROOF_REQUIRED" } }, { status: 401, headers: headers() });
        // Only a definite verdict ends the session. A failed lookup or unexpected error keeps the cookie for the next attempt.
        try { await deps.verifyCookie(); } catch (error) { return failure(error, reply(503)); }
        payload = previous;
      } else {
        let resolved: ResolvedFanSession;
        // A token that does not verify is 401 without touching the cookie, which a bad Privy token says nothing about.
        try { resolved = await deps.resolve(token); } catch (error) { return failure(error, reply(401)); }
        try { mapPrivyIdentity(resolved.identity); } catch { return reply(401); }
        if (resolved.identity.fanSession) return reply(401);
        // Privy's clock may run ahead of ours. Inside the tolerance the sign-in counts as happening now, never in the future.
        if (!Number.isSafeInteger(resolved.tokenIssuedAt) || resolved.tokenIssuedAt < 0 || resolved.tokenIssuedAt > now() + FAN_SESSION_CLOCK_SKEW_MS) return reply(401);
        const sat = Math.min(resolved.tokenIssuedAt, now());
        if (now() >= sat + FAN_SESSION_PROOF_MAX_MS) return reply(401);
        payload = { v: 2, sat, pid: resolved.privyUserId, sid: resolved.sessionId,
          em: resolved.identity.verifiedEmail, pa: resolved.identity.providerAccounts,
          gl: resolved.identity.googleLinked === true, apple: resolved.apple, google: resolved.google };
      }
      let user;
      try { user = await deps.repository.findUserByPrivyId(payload.pid); } catch { return reply(503); }
      // The account is gone or disabled: say so in the body so the client signs out instead of asking again.
      if (!user) {
        // A new Privy user whose account row the session sync (POST /api/auth/session) has not created yet.
        // No session now and no sign-out signal: the client asks again after kyaa:login-synchronized (same reply as the FAN_SESSION_ISSUE=off switch).
        recordAuthDeniedReason("user_missing");
        return Response.json({ session: false }, { headers: headers(clearFanSessionCookieHeader()) });
      }
      if (user.status !== "active") {
        recordAuthDeniedReason("user_inactive");
        return Response.json({ error: { code: FAN_ACCOUNT_UNAVAILABLE } }, { status: 403, headers: headers(clearFanSessionCookieHeader()) });
      }
      if ((previous && previous.uid !== user.id) || fanSessionRevoked(payload.sat!, user.sessionsValidAfter)) { recordAuthDeniedReason("fan_session_revoked"); return reply(401, clearFanSessionCookieHeader()); }
      try {
        if (await deps.isPrivileged(user.id, user.verifiedEmail) || (payload.em !== user.verifiedEmail && payload.em !== null && await deps.isPrivileged(user.id, payload.em))) return new Response(JSON.stringify({ session: false }), { status: 200, headers: headers(clearFanSessionCookieHeader()) });
      } catch { return reply(503); }
      const iat = Math.floor(now() / 1000);
      // 30 days from now, but never past 90 days after the Privy sign-in the session descends from.
      const exp = fanSessionExpiry(iat, payload.sat!);
      const sealed = sealFanSession({ ...payload, uid: user.id, iat, exp }, deps.key);
      const responseHeaders = headers(fanSessionCookieHeader(sealed, exp - iat));
      responseHeaders.set("content-type", "application/json");
      return new Response(JSON.stringify({ session: true, exp: exp * 1000, authenticatedAt: payload.sat }), { status: 200, headers: responseHeaders });
    },
    async DELETE(request: Request): Promise<Response> {
      if (!sameOrigin(request, deps.appOrigin)) { recordAuthDeniedReason("same_origin"); return reply(403); }
      const previous = cookie(request);
      if (previous) {
        try { await deps.revokeSessions(previous.uid, new Date(now()).toISOString()); }
        catch { return reply(503); }
      }
      return reply(204, clearFanSessionCookieHeader());
    },
  };
}
