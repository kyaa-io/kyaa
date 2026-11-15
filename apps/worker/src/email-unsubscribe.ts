import { createHash, createHmac, hkdfSync } from "node:crypto";

// The web app verifies these links in apps/web/server/notification/email-unsubscribe-token.ts.
// Both files must keep the same format; the web test signs with this file and verifies there.
export const EMAIL_UNSUBSCRIBE_TOKEN_TTL_SECONDS = 90 * 24 * 60 * 60;
const CONTEXT = "email-unsubscribe:v1";
const KEY_INFO = "kyaa-email-unsubscribe-v1";

/**
 * The signing key is derived (HKDF-SHA-256) from the PostgREST service token, which the web task and the
 * notification worker both already hold; no secret of its own is stored. Rotating that token voids old links.
 * The web app derives the same key in apps/web/server/notification/email-unsubscribe-token.ts.
 */
export function deriveEmailUnsubscribeKey(secret: string | undefined): Buffer {
  if (!secret || secret.length < 40) throw new Error("EMAIL_UNSUBSCRIBE_SECRET_MISSING");
  return Buffer.from(hkdfSync("sha256", Buffer.from(secret, "utf8"), Buffer.alloc(0), KEY_INFO, 32));
}

/** Short, one-way tag of the derived key. Logged on both sides so operators can see they agree. */
export function emailUnsubscribeKeyTag(key: Buffer): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 8);
}

function base64url(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}

export function signEmailUnsubscribeToken(
  key: Buffer,
  input: { notificationId: string; templateKey: string; now?: Date; ttlSeconds?: number },
): string {
  const issued = Math.floor((input.now ?? new Date()).getTime() / 1000);
  const payload = base64url(
    JSON.stringify({ n: input.notificationId, k: input.templateKey, e: issued + (input.ttlSeconds ?? EMAIL_UNSUBSCRIBE_TOKEN_TTL_SECONDS) }),
  );
  const signature = createHmac("sha256", key).update(`${CONTEXT}.${payload}`).digest();
  return `v1.${payload}.${base64url(signature)}`;
}

export interface EmailUnsubscribeLinks {
  /** Page a person opens from the mail footer. */
  pageUrl: string;
  /** Endpoint a mail client posts to for one-click unsubscribe (RFC 8058). */
  oneClickUrl: string;
}

export function emailUnsubscribeLinks(origin: string, token: string, locale: "ko" | "en"): EmailUnsubscribeLinks {
  const query = `t=${encodeURIComponent(token)}`;
  return {
    pageUrl: `${origin}/email/unsubscribe?${query}&locale=${locale}`,
    oneClickUrl: `${origin}/api/email/unsubscribe?${query}`,
  };
}

export function emailUnsubscribeHeaders(links: EmailUnsubscribeLinks): { Name: string; Value: string }[] {
  return [
    { Name: "List-Unsubscribe", Value: `<${links.oneClickUrl}>` },
    { Name: "List-Unsubscribe-Post", Value: "List-Unsubscribe=One-Click" },
  ];
}
