import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { runmusicKakaoIdSchema } from "@/features/runmusic/domain";

const aad = (owner: string) => Buffer.from(JSON.stringify(["runmusic-contact:v1", "runmusic-2026", owner]));
export function parseRunmusicContactKey(value: string | undefined): Buffer {
  if (!value || !/^[a-f0-9]{64}$/iu.test(value)) throw new Error("RUNMUSIC_CONTACT_UNAVAILABLE");
  return Buffer.from(value, "hex");
}
export function encryptRunmusicContact(value: string, owner: string, key: Buffer) {
  const normalized = runmusicKakaoIdSchema.parse(value);
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(aad(owner));
  const encrypted = Buffer.concat([cipher.update(normalized, "utf8"), cipher.final()]);
  return {
    ciphertext: ["v1", nonce.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join("."),
    masked: normalized.length < 3 ? "•••" : normalized.slice(0, 2) + "••••",
    fingerprint: createHmac("sha256", key).update(aad(owner)).update(JSON.stringify(normalized)).digest("hex"),
  };
}
export function decryptRunmusicContact(value: string, owner: string, key: Buffer): string {
  const parts = value.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") throw new Error("RUNMUSIC_CONTACT_UNAVAILABLE");
  const nonce = Buffer.from(parts[1], "base64url"), tag = Buffer.from(parts[2], "base64url");
  if (nonce.length !== 12 || tag.length !== 16) throw new Error("RUNMUSIC_CONTACT_UNAVAILABLE");
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAAD(aad(owner));
  decipher.setAuthTag(tag);
  return runmusicKakaoIdSchema.parse(Buffer.concat([decipher.update(Buffer.from(parts[3], "base64url")), decipher.final()]).toString("utf8"));
}
