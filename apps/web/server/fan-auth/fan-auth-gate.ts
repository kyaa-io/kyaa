import "server-only";

import { AuthError } from "../../features/auth/domain/auth-errors";
import {
  authenticatePrivyAccessToken,
  type PrivyAccessVerifier,
} from "../auth/authenticate-privy";
import { AppleLifecycleUnavailableError } from "../auth/apple-notifications/apple-lifecycle";
import { authenticateEmailAccessToken, EMAIL_TOKEN_PREFIX } from "../auth/email/email-auth";
import { FAN_SESSION_BEARER, FanSessionRejectedError, fanSessionRevoked } from "../auth/fan-session-cookie";
import type { IdentityRepository } from "../repositories/identity-repository";

export type FanAuthRepository = Pick<IdentityRepository, "findUserByPrivyId">;

export interface AuthorizedFan {
  appUserId: string;
}

export class FanAuthUnavailableError extends Error {
  readonly code = "FAN_AUTH_UNAVAILABLE";
  readonly status = 503;

  constructor() {
    super("Fan authentication is temporarily unavailable");
    this.name = "FanAuthUnavailableError";
  }
}

function requireBearerToken(authorization: string | null | undefined): string {
  const match = authorization
    ? /^Bearer[ \t]+([^\s]+)$/i.exec(authorization.trim())
    : null;
  if (!match) {
    throw new AuthError("AUTHENTICATION_REQUIRED", 401, "Authentication is required");
  }
  return match[1];
}

/**
 * Only a definite verdict is a 401: a bad or expired token, a missing or forged own-session cookie.
 * Reauthentication (allowed=false) keeps its own 403. When the answer is unknown, the request is not passed and the fan keeps the session (503).
 */
async function authenticate(
  accessToken: string,
  verifier: PrivyAccessVerifier,
): ReturnType<typeof authenticatePrivyAccessToken> {
  let failure: unknown;
  const recording: PrivyAccessVerifier = {
    async verify(token) {
      try { return await verifier.verify(token); } catch (error) { failure = error; throw error; }
    },
  };
  try {
    return await authenticatePrivyAccessToken(accessToken, recording);
  } catch (error) {
    const cause = failure ?? error;
    if (cause instanceof AuthError && cause.status !== 401) throw cause;
    if (cause instanceof AppleLifecycleUnavailableError) throw new FanAuthUnavailableError();
    // A Privy token that fails to verify is a bad token. The own-session sentinel fails only for the reasons above, so anything else is on our side.
    if (accessToken === FAN_SESSION_BEARER && !(cause instanceof AuthError) && !(cause instanceof FanSessionRejectedError)) throw new FanAuthUnavailableError();
    throw new AuthError("AUTHENTICATION_REQUIRED", 401, "Authentication is required");
  }
}

export async function authorizeFanRequest(input: {
  authorization?: string | null;
  verifier: PrivyAccessVerifier;
  repository: FanAuthRepository;
}): Promise<AuthorizedFan> {
  const token = requireBearerToken(input.authorization);
  if (token.startsWith(EMAIL_TOKEN_PREFIX)) {
    const owner = await authenticateEmailAccessToken(token);
    let user;
    try { user = await input.repository.findUserByPrivyId(owner.privyUserId); }
    catch { throw new FanAuthUnavailableError(); }
    if (!user || user.id !== owner.appUserId || user.status !== "active") throw new AuthError("AUTHENTICATION_REQUIRED", 403, "Fan access is unavailable");
    return { appUserId: owner.appUserId };
  }
  const identity = await authenticate(token, input.verifier);
  let user: Awaited<ReturnType<FanAuthRepository["findUserByPrivyId"]>>;
  try {
    user = await input.repository.findUserByPrivyId(identity.privyUserId);
  } catch {
    throw new FanAuthUnavailableError();
  }

  if (!user || user.status !== "active") {
    throw new AuthError("AUTHENTICATION_REQUIRED", 403, "Fan access is unavailable");
  }

  if (identity.fanSession && (identity.fanSession.appUserId !== user.id ||
    fanSessionRevoked(identity.fanSession.authenticatedAt, user.sessionsValidAfter))) {
    throw new AuthError("AUTHENTICATION_REQUIRED", 401, "Authentication is required");
  }
  return { appUserId: user.id };
}
