import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createRemoteJWKSet, decodeJwt, jwtVerify, errors } from "jose";
import { z } from "zod";
import { AuthError } from "@/features/auth/domain/auth-errors";
import { loadServerEnv } from "@/server/config/env";

export const EMAIL_TOKEN_PREFIX = "kyaa-email:";
const claimsSchema = z.object({ sub: z.uuid(), session_id: z.uuid(), iss: z.string(),
  aud: z.union([z.string(), z.array(z.string())]), exp: z.number().int() });
const ownerSchema = z.object({ appUserId: z.uuid(), privyUserId: z.string().startsWith("did:privy:") });
export type EmailOwner = z.infer<typeof ownerSchema> & { supabaseUserId: string };
export type EmailAuthConfig = { url: string; serviceRoleKey: string };
export const emailAuthDenied = () => new AuthError("AUTHENTICATION_REQUIRED", 401, "Authentication is required");
export function requireEmailProviderSuccess(error: { status?: number } | null) {
  if (!error) return;
  if (error.status === 429) throw new AuthError("AUTH_RATE_LIMITED", 429, "Try again later");
  if (!error.status || error.status >= 500) throw new Error("Email authentication unavailable");
  throw emailAuthDenied();
}
export function emailAuthConfig(): EmailAuthConfig {
  const env = loadServerEnv();
  return { url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY };
}
// Auth clients are request-scoped and never shared with the service-role DB client:
// password/refresh operations replace a client's Authorization header internally.
export function createEmailAuthClients(config: EmailAuthConfig) {
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, signal: AbortSignal.timeout(15_000) }) } };
  return { auth: createClient(config.url, config.serviceRoleKey, options).auth,
    database: createClient(config.url, config.serviceRoleKey, options) };
}
export function validatedEmailClaims(jwt: string, url: string) {
  try {
    const claims = claimsSchema.parse(decodeJwt(jwt));
    if (claims.iss !== `${url.replace(/\/$/, "")}/auth/v1` || claims.exp <= Math.floor(Date.now() / 1000)
      || !(Array.isArray(claims.aud) ? claims.aud.includes("authenticated") : claims.aud === "authenticated")) throw emailAuthDenied();
    return claims;
  } catch { throw emailAuthDenied(); }
}
export async function authenticateEmailAccessToken(token: string, config = emailAuthConfig(), clients = createEmailAuthClients(config)): Promise<EmailOwner> {
  if (!token.startsWith(EMAIL_TOKEN_PREFIX) || token.length > 16_384) throw emailAuthDenied();
  const jwt = token.slice(EMAIL_TOKEN_PREFIX.length);
  const claims = validatedEmailClaims(jwt, config.url);
  // getUser performs a network-backed signature/user check; decoding alone never authorizes.
  const { data, error } = await clients.auth.getUser(jwt);
  requireEmailProviderSuccess(error);
  if (!data.user || data.user.id !== claims.sub || !data.user.email_confirmed_at) throw emailAuthDenied();
  const gate = await clients.database.rpc("check_mobile_email_session", { p_supabase_user_id: claims.sub, p_session_id: claims.session_id });
  if (gate.error) throw new Error("Email authentication unavailable");
  const owner = ownerSchema.safeParse(gate.data);
  if (!owner.success) throw emailAuthDenied();
  return { ...owner.data, supabaseUserId: claims.sub };
}
// This verifier is ONLY for an already accepted deletion. It cannot authorize a
// normal fan request and remains usable after deletion removes auth.users/session.
export async function verifyAcceptedEmailDeletion(token: string, config: EmailAuthConfig, database: Pick<SupabaseClient, "rpc">): Promise<string> {
  if (!token.startsWith(EMAIL_TOKEN_PREFIX) || token.length > 16_384) throw emailAuthDenied();
  const jwt = token.slice(EMAIL_TOKEN_PREFIX.length);
  const claims = validatedEmailClaims(jwt, config.url);
  const issuer = `${config.url.replace(/\/$/, "")}/auth/v1`;
  try {
    await jwtVerify(jwt, createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`), { timeoutDuration: 10_000 }), {
      issuer, audience: "authenticated", algorithms: ["ES256"], requiredClaims: ["exp", "sub", "session_id"],
    });
  } catch (error) {
    if (error instanceof errors.JWTExpired || error instanceof errors.JWTClaimValidationFailed
      || error instanceof errors.JWSInvalid || error instanceof errors.JWTInvalid || error instanceof errors.JOSEAlgNotAllowed
      || error instanceof errors.JWSSignatureVerificationFailed || error instanceof errors.JWKSNoMatchingKey) throw emailAuthDenied();
    throw new Error("Email authentication unavailable");
  }
  const approved = await database.rpc("has_approved_email_account_deletion", { p_supabase_user_id: claims.sub });
  if (approved.error) throw new Error("Email authentication unavailable");
  if (approved.data !== true) throw emailAuthDenied();
  return `supabase-email:${claims.sub}`;
}
