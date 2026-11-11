import "server-only";
import { parseVerifiedSnapshot, readVerifiedPublicSnapshot } from "./verified-snapshot";
import type { PublicOnchainResult } from "./public-types";

export async function getPublicOnchainResult(read = readVerifiedPublicSnapshot): Promise<PublicOnchainResult> {
  let stored: unknown;
  try {
    stored = await read();
    return { state: "available", snapshot: parseVerifiedSnapshot(stored) };
  } catch {
    // A stale, fully verified payload can supply its timestamp, never current metrics.
    const generatedAt = (stored as { snapshot?: { generatedAt?: string } } | undefined)?.snapshot?.generatedAt;
    if (generatedAt && Date.parse(generatedAt) <= Date.now()) {
      try {
        parseVerifiedSnapshot(stored, Date.parse(generatedAt));
        return { state: "unavailable", lastVerifiedAt: generatedAt };
      } catch { /* Invalid payloads cannot supply a verified timestamp. */ }
    }
    return { state: "unavailable" };
  }
}
