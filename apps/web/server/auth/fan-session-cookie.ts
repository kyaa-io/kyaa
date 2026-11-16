import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { z } from "zod";

// Sealed fan-only session. Account state and revocation remain checked on every request.
export const FAN_SESSION_COOKIE = "__Host-kyaa-fan-session";
export const FAN_SESSION_BEARER = "kyaa-session";
/** The cookie is absent, forged or expired. This is a definite rejection, unlike a failed lookup. */
export class FanSessionRejectedError extends Error {
  constructor() {
    super("Fan session is missing or expired");
    this.name = "FanSessionRejectedError";
  }
}
export const FAN_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
export const FAN_SESSION_PROOF_MAX_MS = 90 * 24 * 60 * 60_000;
/** How far ahead of this server a Privy token's issue time or a cookie's `sat` may be before it counts as forged. */
export const FAN_SESSION_CLOCK_SKEW_MS = 60_000;
const KEY_INFO = "kyaa-fan-session-v1";

const providerAccount = z.object({ subject: z.string().min(1).max(256), email: z.string().max(320).nullable() }).nullable();
export const fanSessionSchema = z.object({
  v: z.union([z.literal(1), z.literal(2)]),
  sat: z.number().int().nonnegative().optional(),
  pid: z.string().min(1).max(128),
  sid: z.string().max(256),
  uid: z.string().uuid(),
  em: z.string().max(320).nullable(),
  pa: z.array(z.object({ issuer: z.enum(["https://accounts.google.com", "https://appleid.apple.com"]), subject: z.string().min(1).max(256) })).max(8),
  gl: z.boolean(),
  apple: providerAccount,
  google: providerAccount,
  iat: z.number().int(),
  exp: z.number().int(),
});
export type FanSession = z.infer<typeof fanSessionSchema>;

/** AUTH_COOKIE_SECRET is already a 32-byte production secret; a separate HKDF label keeps this cookie's key apart from Cognito's. */
export function fanSessionKey(authCookieSecret: string | undefined): Buffer | null {
  if (!authCookieSecret) return null;
  const material = Buffer.from(authCookieSecret, "base64");
  if (material.length !== 32) return null;
  return Buffer.from(hkdfSync("sha256", material, Buffer.alloc(0), KEY_INFO, 32));
}

export function sealFanSession(session: FanSession, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(FAN_SESSION_COOKIE));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(session), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

/** Returns null for anything that is not a current session sealed with this key. */
export function openFanSession(value: string | null | undefined, key: Buffer, now = Date.now()): FanSession | null {
  if (!value || value.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const bytes = Buffer.from(value, "base64url");
    if (bytes.length < 29) return null;
    const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from(FAN_SESSION_COOKIE));
    decipher.setAuthTag(bytes.subarray(12, 28));
    const parsed = fanSessionSchema.safeParse(JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8")));
    if (!parsed.success) return null;
    const nowSeconds = Math.floor(now / 1000);
    if (parsed.data.v === 2 && (parsed.data.sat === undefined || parsed.data.sat > now + FAN_SESSION_CLOCK_SKEW_MS)) return null;
    if (parsed.data.exp <= nowSeconds || parsed.data.iat > nowSeconds + 60 || parsed.data.exp - parsed.data.iat > (parsed.data.v === 1 ? 6 * 3600 : FAN_SESSION_MAX_AGE_SECONDS) || parsed.data.exp <= parsed.data.iat) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

/** The last Privy sign-in is older than the 90-day ceiling. The cookie can no longer be renewed or used, however fresh its own `exp`. */
export function fanSessionProofExpired(session: FanSession, now: number): boolean {
  return session.v === 2 && session.sat !== undefined && now >= session.sat + FAN_SESSION_PROOF_MAX_MS;
}

/** The latest expiry (epoch seconds) a cookie issued at `issuedAt` may carry: 30 days, never past the 90-day sign-in ceiling. */
export function fanSessionExpiry(issuedAt: number, authenticatedAtMs: number): number {
  return Math.min(issuedAt + FAN_SESSION_MAX_AGE_SECONDS, Math.floor((authenticatedAtMs + FAN_SESSION_PROOF_MAX_MS) / 1000));
}

/**
 * Sign-out revokes every session whose sign-in came before it. Privy reports issue time in whole seconds while the cutoff is a
 * millisecond server time, so both sides are compared in whole seconds: a sign-in in the same second as the sign-out counts as after it,
 * which lets a person sign straight back in. An unreadable cutoff revokes.
 */
export function fanSessionRevoked(authenticatedAtMs: number, sessionsValidAfter: string | null | undefined): boolean {
  if (!sessionsValidAfter) return false;
  const cutoff = Date.parse(sessionsValidAfter);
  return !Number.isFinite(cutoff) || Math.floor(authenticatedAtMs / 1000) < Math.floor(cutoff / 1000);
}

export function fanSessionCookieHeader(value: string, maxAge = FAN_SESSION_MAX_AGE_SECONDS): string {
  return `${FAN_SESSION_COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
}

export function clearFanSessionCookieHeader(): string {
  return `${FAN_SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

export function readFanSessionCookie(cookieHeader: string | null): string | null {
  const matches = (cookieHeader ?? "").split(";").map((part) => part.trim()).filter((part) => part.startsWith(`${FAN_SESSION_COOKIE}=`));
  return matches.length === 1 ? matches[0].slice(FAN_SESSION_COOKIE.length + 1) : null;
}
