import { describe, expect, it } from "vitest";
import { fanSnsLabel, parseFanBio, parseFanSnsUrl } from "./sns-link";
import { ownedFanProfilePublicInputSchema, socialProfileCardSchema } from "./domain";

describe("fan SNS link", () => {
  it("keeps an https address with a plain domain as written", () => {
    expect(parseFanSnsUrl("  https://www.instagram.com/fan_a?igsh=1#x ")).toBe("https://www.instagram.com/fan_a?igsh=1#x");
    expect(parseFanSnsUrl("https://linktr.ee/fan")).toBe("https://linktr.ee/fan");
  });
  it.each(["http://instagram.com/a", "javascript:alert(1)", "data:text/html,x", "https://user:pw@instagram.com/a", "https://instagram.com:8443/a", "https://127.0.0.1/a", "https://[::1]/a", "https://localhost/a", "https://exa mple.com", "https://instagram.com\\@evil.com", "https:/instagram.com/a", "//instagram.com/a", `https://a.com/${"x".repeat(300)}`, ""])("refuses %s", value => {
    expect(parseFanSnsUrl(value)).toBeNull();
  });
  it("names the platform and handle, else the host", () => {
    expect(fanSnsLabel("https://www.instagram.com/fan_a/")).toBe("Instagram @fan_a");
    expect(fanSnsLabel("https://x.com/fan_b")).toBe("X @fan_b");
    expect(fanSnsLabel("https://www.youtube.com/@fan_c")).toBe("YouTube @fan_c");
    expect(fanSnsLabel("https://www.youtube.com/channel/UC1")).toBe("YouTube");
    expect(fanSnsLabel("https://linktr.ee/fan")).toBe("linktr.ee");
    expect(fanSnsLabel("https://x.com/%E0%A4%A")).toBe("X");
  });
  it("takes one line of at most 60 characters for the intro", () => {
    expect(parseFanBio("  안녕하세요  ")).toBe("안녕하세요");
    expect(parseFanBio("   ")).toBeNull();
    expect(parseFanBio("가".repeat(60))).toBe("가".repeat(60));
    expect(parseFanBio("가".repeat(61))).toBeUndefined();
    expect(parseFanBio("첫 줄\n둘째 줄")).toBeUndefined();
  });
  it("input schema clears blanks to null and refuses bad links", () => {
    expect(ownedFanProfilePublicInputSchema.parse({ favoriteSlug: null, snsUrl: " ", bio: "" })).toEqual({ favoriteSlug: null, snsUrl: null, bio: null });
    expect(ownedFanProfilePublicInputSchema.safeParse({ favoriteSlug: null, snsUrl: "http://x.com/a", bio: null }).success).toBe(false);
    expect(ownedFanProfilePublicInputSchema.safeParse({ favoriteSlug: null, snsUrl: null, bio: null, email: "a@b.c" }).success).toBe(false);
  });
  it("card schema refuses a stored link that no longer passes, and any extra key", () => {
    const base = { favorite: null, bio: null, stats: null };
    expect(socialProfileCardSchema.safeParse({ ...base, snsUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(socialProfileCardSchema.safeParse({ ...base, snsUrl: null, email: "a@b.c" }).success).toBe(false);
  });
});
