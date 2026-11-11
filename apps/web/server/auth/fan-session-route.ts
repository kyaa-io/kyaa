import "server-only";
import { mapPrivyIdentity } from "../../features/auth/domain/identity";
import { EMAIL_TOKEN_PREFIX } from "./email/email-auth";
import type { FanAuthRepository } from "../fan-auth/fan-auth-gate";
import type { ResolvedFanSession } from "./privy-node-verifier";
import {
  clearFanSessionCookieHeader,
  FAN_SESSION_BEARER,
  FAN_SESSION_MAX_AGE_SECONDS,
  fanSessionCookieHeader,
  sealFanSession,
} from "./fan-session-cookie";

export interface FanSessionRouteDependencies {
  appOrigin: string;
  key: Buffer | null;
  resolve(accessToken: string): Promise<ResolvedFanSession>;
  repository: FanAuthRepository;
  now?: () => number;
}

const headers = (cookie?: string) => {
  const result = new Headers({ "cache-control": "no-store", "referrer-policy": "no-referrer", vary: "Authorization, Cookie" });
  if (cookie) result.append("set-cookie", cookie);
  return result;
};
const reply = (status: number, cookie?: string) => new Response(null, { status, headers: headers(cookie) });

// Cookie auth must not be reachable from another site: the browser sends Origin on POST/DELETE fetches, and a page on
// another site cannot set it to ours. SameSite=Strict and the Bearer sentinel required on reads are the other two layers.
function sameOrigin(request: Request, appOrigin: string): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  if (origin === appOrigin) return true;
  // The same app is served on more than one host (preview, www); the browser's own Host for this request also counts.
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try { return host !== null && new URL(origin).host === host; } catch { return false; }
}

function bearer(request: Request): string | null {
  const match = /^Bearer[ \t]+([^\s]+)$/i.exec(request.headers.get("authorization")?.trim() ?? "");
  return match ? match[1] : null;
}

/** POST: a real Privy token in, a fresh 6-hour fan session cookie out. DELETE: sign-out clears it. */
export function createFanSessionRoute(deps: FanSessionRouteDependencies) {
  const now = deps.now ?? Date.now;
  return {
    async POST(request: Request): Promise<Response> {
      if (!sameOrigin(request, deps.appOrigin)) return reply(403);
      if (!deps.key) return reply(503);
      const token = bearer(request);
      if (!token || token === FAN_SESSION_BEARER || token.startsWith(EMAIL_TOKEN_PREFIX)) return reply(401);
      let resolved: ResolvedFanSession;
      try {
        resolved = await deps.resolve(token);
        mapPrivyIdentity(resolved.identity);
      } catch {
        return reply(401);
      }
      let user;
      try { user = await deps.repository.findUserByPrivyId(resolved.privyUserId); }
      catch { return reply(503); }
      if (!user || user.status !== "active") return reply(403, clearFanSessionCookieHeader());
      const issuedAt = Math.floor(now() / 1000);
      const sealed = sealFanSession({
        v: 1,
        pid: resolved.privyUserId,
        sid: resolved.sessionId,
        uid: user.id,
        em: resolved.identity.verifiedEmail,
        pa: resolved.identity.providerAccounts,
        gl: resolved.identity.googleLinked === true,
        apple: resolved.apple,
        google: resolved.google,
        iat: issuedAt,
        exp: issuedAt + FAN_SESSION_MAX_AGE_SECONDS,
      }, deps.key);
      return reply(204, fanSessionCookieHeader(sealed));
    },
    async DELETE(request: Request): Promise<Response> {
      if (!sameOrigin(request, deps.appOrigin)) return reply(403);
      return reply(204, clearFanSessionCookieHeader());
    },
  };
}
