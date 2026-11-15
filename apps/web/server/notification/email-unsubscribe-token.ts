import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

// apps/worker/src/email-unsubscribe.ts signs these links. Keep the two formats identical.
const CONTEXT = "email-unsubscribe:v1";
const payloadSchema = z.object({ n: z.uuid(), k: z.string().regex(/^[a-z0-9:_-]{3,160}$/), e: z.number().int().positive() }).strict();

export type EmailUnsubscribeTokenResult =
  | { ok: true; notificationId: string; templateKey: string; expiresAt: number }
  | { ok: false; reason: "invalid" | "expired" };

export function verifyEmailUnsubscribeToken(keyHex: string, token: string, now: Date = new Date()): EmailUnsubscribeTokenResult {
  if (!/^[a-f0-9]{64}$/i.test(keyHex)) return { ok: false, reason: "invalid" };
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1" || token.length > 600) return { ok: false, reason: "invalid" };
  const [, payload, signature] = parts as [string, string, string];
  const expected = createHmac("sha256", Buffer.from(keyHex, "hex")).update(`${CONTEXT}.${payload}`).digest();
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
