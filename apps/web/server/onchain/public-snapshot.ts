import "server-only";
import { parseVerifiedSnapshot, readVerifiedPublicSnapshot } from "./verified-snapshot";
import type { PublicOnchainResult } from "./public-types";

export async function getPublicOnchainResult(read = readVerifiedPublicSnapshot): Promise<PublicOnchainResult> {
  try { return { state: "available", snapshot: parseVerifiedSnapshot(await read()) }; }
  catch { return { state: "unavailable" }; }
}
