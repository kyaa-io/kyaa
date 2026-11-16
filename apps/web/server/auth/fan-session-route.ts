import "server-only";
import { mapPrivyIdentity } from "../../features/auth/domain/identity";
import { EMAIL_TOKEN_PREFIX } from "./email/email-auth";
import type { FanAuthRepository } from "../fan-auth/fan-auth-gate";
import type { ResolvedFanSession } from "./privy-node-verifier";
import {
  clearFanSessionCookieHeader, FAN_SESSION_BEARER, FAN_SESSION_MAX_AGE_SECONDS,
  FAN_SESSION_PROOF_MAX_MS, fanSessionCookieHeader, sealFanSession,
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
function bearer(request: Request): string | null {
  return /^Bearer[ \t]+([^\s]+)$/i.exec(request.headers.get("authorization")?.trim() ?? "")?.[1] ?? null;
}

export function createFanSessionRoute(deps: FanSessionRouteDependencies) {
  const now = deps.now ?? Date.now;
  const cookie = (request: Request) => deps.key ? openFanSession(readFanSessionCookie(request.headers.get("cookie")), deps.key, now()) : null;
  return {
    async POST(request: Request): Promise<Response> {
      if (!sameOrigin(request, deps.appOrigin)) return reply(403);
      if (deps.enabled === false) return Response.json({ session: false }, { headers: headers(clearFanSessionCookieHeader()) });
      if (!deps.key) return reply(503);
      const token = bearer(request);
      if (!token || token.startsWith(EMAIL_TOKEN_PREFIX)) return reply(401);
      let payload: Omit<FanSession, "uid" | "iat" | "exp">;
      const previous = token === FAN_SESSION_BEARER ? cookie(request) : null;
      if (token === FAN_SESSION_BEARER) {
        if (!previous || previous.v !== 2 || previous.sat === undefined) return reply(401, clearFanSessionCookieHeader());
        if (now() >= previous.sat + FAN_SESSION_PROOF_MAX_MS) return Response.json({ error: { code: "PRIVY_PROOF_REQUIRED" } }, { status: 401, headers: headers() });
        try { await deps.verifyCookie(); } catch { return reply(401, clearFanSessionCookieHeader()); }
        payload = previous;
      } else {
        try {
          const resolved = await deps.resolve(token);
          mapPrivyIdentity(resolved.identity);
          if (resolved.identity.fanSession) return reply(401);
          payload = { v: 2, sat: now(), pid: resolved.privyUserId, sid: resolved.sessionId,
            em: resolved.identity.verifiedEmail, pa: resolved.identity.providerAccounts,
            gl: resolved.identity.googleLinked === true, apple: resolved.apple, google: resolved.google };
        } catch { return reply(401); }
      }
      let user;
      try { user = await deps.repository.findUserByPrivyId(payload.pid); } catch { return reply(503); }
      if (!user || user.status !== "active") return reply(403, clearFanSessionCookieHeader());
      if ((previous && previous.uid !== user.id) || (user.sessionsValidAfter && payload.sat! <= Date.parse(user.sessionsValidAfter))) return reply(401, clearFanSessionCookieHeader());
      try {
        if (await deps.isPrivileged(user.id, user.verifiedEmail) || (payload.em !== user.verifiedEmail && payload.em !== null && await deps.isPrivileged(user.id, payload.em))) return new Response(JSON.stringify({ session: false }), { status: 200, headers: headers(clearFanSessionCookieHeader()) });
      } catch { return reply(503); }
      const iat = Math.floor(now() / 1000);
      const exp = iat + FAN_SESSION_MAX_AGE_SECONDS;
      const sealed = sealFanSession({ ...payload, uid: user.id, iat, exp }, deps.key);
      const responseHeaders = headers(fanSessionCookieHeader(sealed, exp - Math.floor(now() / 1000)));
      responseHeaders.set("content-type", "application/json");
      return new Response(JSON.stringify({ session: true, exp: exp * 1000, authenticatedAt: payload.sat }), { status: 200, headers: responseHeaders });
    },
    async DELETE(request: Request): Promise<Response> {
      if (!sameOrigin(request, deps.appOrigin)) return reply(403);
      const previous = cookie(request);
      if (previous) {
        try { await deps.revokeSessions(previous.uid, new Date(now()).toISOString()); }
        catch { return reply(503); }
      }
      return reply(204, clearFanSessionCookieHeader());
    },
  };
}
