import { createHash, createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import { z } from "zod";

// apps/worker/src/email-unsubscribe.ts signs these links. Keep the two formats identical.
const CONTEXT = "email-unsubscribe:v1";
const KEY_INFO = "kyaa-email-unsubscribe-v1";

/** Same derivation as the worker: HKDF-SHA-256 of the PostgREST service token. Rotating the token voids old links. */
export function deriveEmailUnsubscribeKey(secret: string | undefined): Buffer | null {
  if (!secret || secret.length < 40) return null;
  return Buffer.from(hkdfSync("sha256", Buffer.from(secret, "utf8"), Buffer.alloc(0), KEY_INFO, 32));
}

export function emailUnsubscribeKeyTag(key: Buffer): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 8);
}
const payloadSchema = z.object({ n: z.uuid(), k: z.string().regex(/^[a-z0-9:_-]{3,160}$/), e: z.number().int().positive() }).strict();

export type EmailUnsubscribeTokenResult =
  | { ok: true; notificationId: string; templateKey: string; expiresAt: number }
  | { ok: false; reason: "invalid" | "expired" };

export function verifyEmailUnsubscribeToken(key: Buffer, token: string, now: Date = new Date()): EmailUnsubscribeTokenResult {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1" || token.length > 600) return { ok: false, reason: "invalid" };
  const [, payload, signature] = parts as [string, string, string];
  const expected = createHmac("sha256", key).update(`${CONTEXT}.${payload}`).digest();
  const given = Buffer.from(signature, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: "invalid" };
  let claims;
  try {
    claims = payloadSchema.parse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (claims.e * 1000 <= now.getTime()) return { ok: false, reason: "expired" };
  return { ok: true, notificationId: claims.n, templateKey: claims.k, expiresAt: claims.e };
}
