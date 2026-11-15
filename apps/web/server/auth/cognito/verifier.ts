import "server-only";
import { createRemoteJWKSet, decodeJwt, jwtVerify, type JWTVerifyGetKey } from "jose";
import { AuthError } from "../../../features/auth/domain/auth-errors";

export const COGNITO_TOKEN_PREFIX = "kyaa-cognito:";
const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
export const cognitoDenied = () => new AuthError("AUTHENTICATION_REQUIRED", 401, "Authentication is required");
export type CognitoIdentity = { issuer: string; subject: string; email: string; tokenId: string; provider?: { name: "google" | "apple"; issuer: string; subject: string } };
export function isCognitoToken(token: string): boolean {
  if (token.startsWith(COGNITO_TOKEN_PREFIX)) return true;
  try { return /^https:\/\/cognito-idp\.[a-z0-9-]+\.amazonaws\.com\//.test(String(decodeJwt(token).iss)); }
  catch { return false; }
}

export function createCognitoVerifier(config: { issuer: string; clientId: string }, key?: JWTVerifyGetKey) {
  const jwksUrl = `${config.issuer}/.well-known/jwks.json`;
  if (!keySets.has(jwksUrl) && !key) keySets.set(jwksUrl, createRemoteJWKSet(new URL(jwksUrl), { timeoutDuration: 5_000, cooldownDuration: 30_000, cacheMaxAge: 600_000 }));
  return async (token: string, use: "access" | "id" = "access", nonce?: string): Promise<CognitoIdentity> => {
    if (token.length > 16_384) throw cognitoDenied();
    const jwt = token.startsWith(COGNITO_TOKEN_PREFIX) ? token.slice(COGNITO_TOKEN_PREFIX.length) : token;
    try {
      const { payload } = await jwtVerify(jwt, key ?? keySets.get(jwksUrl)!, {
        issuer: config.issuer, algorithms: ["RS256"], requiredClaims: ["exp", "iat", "sub", "token_use"],
        ...(use === "id" ? { audience: config.clientId } : {}),
      });
      if (payload.token_use !== use || (use === "access" && payload.client_id !== config.clientId)
        || typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 256
        || (nonce !== undefined && payload.nonce !== nonce)) throw cognitoDenied();
      const email = typeof payload.email === "string" && payload.email_verified === true ? payload.email.trim().toLowerCase() : "";
      let provider: CognitoIdentity["provider"];
      if (use === "id" && payload.identities !== undefined) {
        const identities: unknown = typeof payload.identities === "string" ? JSON.parse(payload.identities) : payload.identities;
        if (!Array.isArray(identities) || identities.length < 1 || identities.length > 8) throw cognitoDenied();
        const primary = identities.filter((entry) => entry?.primary === true || entry?.primary === "true");
        const account = identities.length === 1 ? identities[0] : primary.length === 1 ? primary[0] : null;
        if (!account || typeof account.userId !== "string" || !account.userId || account.userId.length > 256) throw cognitoDenied();
        if (account.providerName === "Google") provider = { name: "google", issuer: "https://accounts.google.com", subject: account.userId };
        else if (account.providerName === "SignInWithApple") provider = { name: "apple", issuer: "https://appleid.apple.com", subject: account.userId };
        else throw cognitoDenied();
      }
      return { issuer: config.issuer, subject: payload.sub, email, ...(provider ? { provider } : {}), tokenId: typeof payload.origin_jti === "string" ? payload.origin_jti : typeof payload.jti === "string" ? payload.jti : `${payload.sub}:${payload.iat}` };
    } catch { throw cognitoDenied(); }
  };
}
