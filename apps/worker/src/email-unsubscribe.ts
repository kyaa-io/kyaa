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

/**
 * Ties a link to the address the mail went to without putting the address (or its plain hash) in the link.
 * The address part is public.email_destination_fingerprint (sha256 of the trimmed, lower-cased address), the value
 * fan_notification_channels.destination_fingerprint holds; the database recomputes this in
 * public.email_unsubscribe_destination_binding and refuses the link once the member's mail address has changed.
 */
export function emailUnsubscribeDestinationBinding(notificationId: string, destination: string): string {
  const fingerprint = createHash("sha256").update(destination.trim().toLowerCase()).digest("hex");
  return createHash("sha256").update(`email-unsubscribe-destination:v1:${notificationId.toLowerCase()}:${fingerprint}`).digest("hex");
}

export function signEmailUnsubscribeToken(
  key: Buffer,
  input: { notificationId: string; templateKey: string; destination: string; now?: Date; ttlSeconds?: number },
): string {
  const issued = Math.floor((input.now ?? new Date()).getTime() / 1000);
  const payload = base64url(
    JSON.stringify({
      n: input.notificationId,
      k: input.templateKey,
      d: emailUnsubscribeDestinationBinding(input.notificationId, input.destination),
      e: issued + (input.ttlSeconds ?? EMAIL_UNSUBSCRIBE_TOKEN_TTL_SECONDS),
    }),
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
