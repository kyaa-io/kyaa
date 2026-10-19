import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";

export const PARTICIPATION_EVENT = "kyaa-wave-2026";
export function parseParticipationKey(value: string | undefined): Buffer {
  if (!value || !/^[a-f0-9]{64}$/iu.test(value)) throw new Error("PARTICIPATION_UNAVAILABLE");
  return Buffer.from(value, "hex");
}
const aad = (appUserId: string) => Buffer.from(JSON.stringify(["kyaa-wave-participation:v1", PARTICIPATION_EVENT, appUserId]));
export function encryptParticipationName(name: string, appUserId: string, key: Buffer): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(aad(appUserId));
  const encrypted = Buffer.concat([cipher.update(name, "utf8"), cipher.final()]);
  return ["v1", nonce.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}
export function decryptParticipationName(value: string, appUserId: string, key: Buffer): string {
  const parts = value.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") throw new Error("PARTICIPATION_UNAVAILABLE");
  const nonce = Buffer.from(parts[1], "base64url"), tag = Buffer.from(parts[2], "base64url");
  if (nonce.length !== 12 || tag.length !== 16) throw new Error("PARTICIPATION_UNAVAILABLE");
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAAD(aad(appUserId));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(Buffer.from(parts[3], "base64url")), decipher.final()]).toString("utf8");
}
export const participationCodeHash = (code: string) => createHash("sha256").update(code).digest("hex");
export const participationPayloadHmac = (name: string, code: string, appUserId: string, key: Buffer) =>
  createHmac("sha256", key).update(JSON.stringify(["kyaa-wave-participation-request:v1", PARTICIPATION_EVENT, appUserId, name, code])).digest("hex");
