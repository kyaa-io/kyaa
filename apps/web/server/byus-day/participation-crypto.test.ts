import { describe, expect, it } from "vitest";
import { participationInputSchema } from "../../features/connect/kyaa-wave-participation";
import { encryptParticipationName, decryptParticipationName, parseParticipationKey, participationPayloadHmac } from "./participation-crypto";
const key = parseParticipationKey("12".repeat(32));
describe("private participation name", () => {
 it("normalizes names and codes and rejects control characters, ambiguous codes and oversized names", () => {
  expect(participationInputSchema.parse({ name: " Jose\u0301 ", code: "abcd-efgh" })).toEqual({ name: "José", code: "ABCDEFGH" });
  for (const name of ["", "김\n", "a\u0000b", "x".repeat(81)]) expect(participationInputSchema.safeParse({ name, code: "ABCDEFGH" }).success).toBe(false);
  expect(participationInputSchema.safeParse({ name: "김", code: "ABCD0I1O" }).success).toBe(false);
 });
 it("encrypts randomly and authenticates the event/owner binding and ciphertext", () => {
  const value = encryptParticipationName("김가온", "owner", key);
  expect(value).not.toContain("김가온");
  expect(encryptParticipationName("김가온", "owner", key)).not.toBe(value);
  expect(decryptParticipationName(value, "owner", key)).toBe("김가온");
  expect(() => decryptParticipationName(value, "other", key)).toThrow();
  expect(() => decryptParticipationName(value.slice(0, -2) + "xx", "owner", key)).toThrow();
 });
 it("uses a deterministic canonical plaintext HMAC independently of random encryption", () => {
  expect(participationPayloadHmac("김", "ABCDEFGH", "owner", key)).toBe(participationPayloadHmac("김", "ABCDEFGH", "owner", key));
  expect(participationPayloadHmac("김", "ABCDEFGH", "owner", key)).not.toBe(participationPayloadHmac("박", "ABCDEFGH", "owner", key));
  for (const value of [undefined, "", "ab", "x".repeat(64), "12".repeat(33)]) expect(() => parseParticipationKey(value)).toThrow("PARTICIPATION_UNAVAILABLE");
 });
});
