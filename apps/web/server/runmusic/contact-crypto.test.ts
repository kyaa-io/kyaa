import { describe, expect, it } from "vitest";
import { decryptRunmusicContact, encryptRunmusicContact, parseRunmusicContactKey } from "./contact-crypto";

const key = parseRunmusicContactKey("ab".repeat(32));
describe("runmusic private contacts", () => {
  it("encrypts with random nonces while keeping semantic retry fingerprints stable", () => {
    const a = encryptRunmusicContact("  kakao.test  ", "owner", key), b = encryptRunmusicContact("kakao.test", "owner", key);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.ciphertext).not.toContain("kakao.test");
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.masked).toBe("ka••••");
    expect(decryptRunmusicContact(a.ciphertext, "owner", key)).toBe("kakao.test");
    expect(encryptRunmusicContact("ab", "owner", key).masked).not.toContain("ab");
  });
  it("rejects wrong owners, changed ciphertext, malformed keys and control characters", () => {
    const { ciphertext } = encryptRunmusicContact("my-id", "owner", key);
    expect(() => decryptRunmusicContact(ciphertext, "other", key)).toThrow();
    const parts = ciphertext.split("."); parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptRunmusicContact(parts.join("."), "owner", key)).toThrow();
    expect(() => parseRunmusicContactKey(undefined)).toThrow();
    expect(() => parseRunmusicContactKey("ab")).toThrow();
    expect(() => encryptRunmusicContact("a\u0000b", "owner", key)).toThrow();
  });
});
