import { describe, expect, it } from "vitest";
import { participationInputSchema, participationQrCode } from "./kyaa-wave-participation";
const origin = "https://byus.kr";
const route = `${origin}/connect/kyaa-wave/participate`;
describe("participation code compatibility", () => {
  it.each(["abc234", "abcd-efgh", "ABCDEFGH23456789"])("accepts six-character and printed legacy codes: %s", code => {
    expect(participationInputSchema.safeParse({ code, name: "김" }).success).toBe(true);
    expect(participationQrCode(`${route}?code=${code}&locale=ko`, origin)).toBe(code.replaceAll("-", "").toUpperCase());
  });
  it.each(["ABC23", "ABC2345", "A".repeat(17), "ABC01O", "ABC!23"])("rejects invalid code: %s", code => {
    expect(participationInputSchema.safeParse({ code, name: "김" }).success).toBe(false);
    expect(participationQrCode(`${route}?code=${code}`, origin)).toBeNull();
  });
  it.each([
    "https://other.example/connect/kyaa-wave/participate?code=ABC234",
    "javascript:alert(1)", "ABC234", `${route}?code=ABC234&code=ABC234`,
    `${route}?code=ABC234#other`, `${origin}/login?code=ABC234`,
    "https://user:pass@byus.kr/connect/kyaa-wave/participate?code=ABC234",
    `${route}?code=ABC234%0Ahttps://other.example`, `${route}?locale=ko`,
  ])("rejects QR contents outside the attendance route: %s", value => {
    expect(participationQrCode(value, origin)).toBeNull();
  });
});
