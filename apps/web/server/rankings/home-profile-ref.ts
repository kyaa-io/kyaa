import "server-only";
import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import type { HomeFanProfileLocator, HomeFanProfileRef } from "@/features/rankings/domain/types";

/** Same ten-minute lifetime as the home snapshot refresh. A newer DB snapshot also invalidates the ref. */
export const HOME_PROFILE_REF_TTL_MS = 10 * 60 * 1000;
const purpose = "home-ranking-profile:v1";
function signature(ref: HomeFanProfileLocator, viewer: string, secret: string | undefined) {
  if (!secret) throw new Error("HOME_PROFILE_SIGNING_UNAVAILABLE");
  // Derive a purpose-specific key from the existing server-only Privy secret. No client receives the viewer id or key.
  const key = hkdfSync("sha256", secret, "kyaa", purpose, 32);
  return createHmac("sha256", Buffer.from(key))
    .update(JSON.stringify([purpose, viewer, ref.kind, ref.day, ref.computedAt, ref.metric, ref.rank])).digest();
}

export function signHomeProfileRef(ref: HomeFanProfileLocator, viewer: string, secret: string | undefined): HomeFanProfileRef {
  return { ...ref, signature: signature(ref, viewer, secret).toString("base64url") };
}

export function openHomeProfileRef(ref: HomeFanProfileRef, viewer: string | null, secret: string | undefined, now = Date.now()): HomeFanProfileLocator {
  if (viewer === null) throw new Error("SOCIAL_FORBIDDEN");
  const { signature: signed, ...locator } = ref;
  const expected = signature(locator, viewer, secret);
  const received = Buffer.from(signed, "base64url");
  const age = now - Date.parse(locator.computedAt);
  if (received.length !== expected.length || received.toString("base64url") !== signed
    || !timingSafeEqual(received, expected) || !Number.isFinite(age) || age < 0 || age >= HOME_PROFILE_REF_TTL_MS) {
    throw new Error("SOCIAL_NOT_FOUND");
  }
  // Only trusted coordinates go to the service-role RPC; it rechecks snapshot identity and current visibility.
  return locator;
}
