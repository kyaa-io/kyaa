import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { z } from "zod";

// Our own short session for fans already signed in through Privy. After a Privy token passes, POST /api/auth/fan-session
// seals who the fan is into an httpOnly cookie. When Privy is slow the browser sends "Bearer kyaa-session" instead of a
// Privy token, and the verifier reads this cookie. The cookie can only be issued or renewed with a real Privy token, so it
// never extends itself; the fan gate still checks app_users status on every request (suspension, deletion).
// Only fan routes accept it: admin and operator gates refuse the sentinel.
export const FAN_SESSION_COOKIE = "__Host-kyaa-fan-session";
export const FAN_SESSION_BEARER = "kyaa-session";
export const FAN_SESSION_MAX_AGE_SECONDS = 6 * 60 * 60;
const KEY_INFO = "kyaa-fan-session-v1";

const providerAccount = z.object({ subject: z.string().min(1).max(256), email: z.string().max(320).nullable() }).nullable();
export const fanSessionSchema = z.object({
  v: z.literal(1),
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
    if (parsed.data.exp <= nowSeconds || parsed.data.iat > nowSeconds + 60 || parsed.data.exp - parsed.data.iat > FAN_SESSION_MAX_AGE_SECONDS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export function fanSessionCookieHeader(value: string): string {
  return `${FAN_SESSION_COOKIE}=${value}; Path=/; Max-Age=${FAN_SESSION_MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
}

export function clearFanSessionCookieHeader(): string {
  return `${FAN_SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

export function readFanSessionCookie(cookieHeader: string | null): string | null {
  const matches = (cookieHeader ?? "").split(";").map((part) => part.trim()).filter((part) => part.startsWith(`${FAN_SESSION_COOKIE}=`));
  return matches.length === 1 ? matches[0].slice(FAN_SESSION_COOKIE.length + 1) : null;
}
