import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { fanSortPositionSchema } from "./sorted-domain";
import type { z } from "zod";

type Position = z.infer<typeof fanSortPositionSchema>;
export type FanCursorScope = { actor: string | null; page: string; mode: string; search: string; locale: string };
function key(secret: string | undefined) {
  if (!secret || !/^[A-Za-z0-9+/]{43}=$/.test(secret)) throw new Error("GROUPS_UNAVAILABLE");
  // Domain separation: the existing session secret never encrypts a fan cursor directly.
  return Buffer.from(hkdfSync("sha256", Buffer.from(secret, "base64"), "kyaa", "fan-list-sort:v1", 32));
}
const aad = (scope: FanCursorScope) => Buffer.from(JSON.stringify(["fan-list-sort:v1", scope.actor, scope.page, scope.mode, scope.search, scope.locale]));
export function sealFanCursor(position: Position, scope: FanCursorScope, secret: string | undefined) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  cipher.setAAD(aad(scope));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(position), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}
export function openFanCursor(value: string, scope: FanCursorScope, secret: string | undefined): Position {
  const cursorKey = key(secret);
  try {
    if (!/^[A-Za-z0-9_-]{40,2048}$/.test(value)) throw new Error();
    const bytes = Buffer.from(value, "base64url");
    if (bytes.toString("base64url") !== value) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", cursorKey, bytes.subarray(0, 12));
    decipher.setAAD(aad(scope));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return fanSortPositionSchema.parse(JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8")));
  } catch { throw new SyntaxError("Invalid fan cursor"); }
}
