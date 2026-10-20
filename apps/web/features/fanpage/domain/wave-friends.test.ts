import { describe, expect, it } from "vitest";
import { waveFriendToken } from "./wave-friends";
const origin = "https://kyaa.io", token = "11111111-1111-4111-8111-111111111111";
const link = `${origin}/kyaa-wave-fanpage?tab=friends&friend=${token}`;
describe("Wave friend QR", () => {
  it("accepts only a Wave friend link from this origin", () => expect(waveFriendToken(link, origin)).toBe(token));
  it.each([link.replace(origin, "https://other.example"), link.replace("/kyaa-wave-fanpage", "/fans"), link.replace("tab=friends", "tab=home"), `${link}&friend=${token}`, link.replace(token, "bad"), `javascript:${link}`, link.replace("https://", "https://user:pass@")])("rejects an unrelated or ambiguous QR %s", value => expect(waveFriendToken(value, origin)).toBeNull());
});
