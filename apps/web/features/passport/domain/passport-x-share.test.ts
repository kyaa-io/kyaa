import { describe, expect, it } from "vitest";
import { passportShareText, passportShareUrl, xPostIntentUrl } from "./passport-x-share";

describe("passport X share", () => {
  it("marks the shared landing link as a visit from X", () => {
    const url = new URL(passportShareUrl("https://kyaa.io", "a".repeat(32), "ko"));
    expect(url.pathname).toBe(`/s/${"a".repeat(32)}`);
    expect(Object.fromEntries(url.searchParams)).toEqual({ locale: "ko", utm_source: "x", utm_medium: "social", utm_campaign: "passport-share" });
  });

  it("mentions the official account in Korean and in every other language", () => {
    expect(passportShareText("ko", "엘리나")).toBe("엘리나 팬 패스포트를 받았어요 @kyaa_app");
    expect(passportShareText("ja", "Elina")).toBe("I got my Elina Fan Passport @kyaa_app");
  });

  it("fills X's composer with text, link and hashtags, and no picture parameter", () => {
    const link = passportShareUrl("https://kyaa.io", "b".repeat(32), "en");
    const intent = new URL(xPostIntentUrl({ text: "I got my Elina Fan Passport @kyaa_app", url: link, hashtags: ["kyaa"] }));
    expect(`${intent.origin}${intent.pathname}`).toBe("https://x.com/intent/tweet");
    expect([...intent.searchParams.keys()]).toEqual(["text", "url", "hashtags"]);
    expect(intent.searchParams.get("url")).toBe(link);
    expect(intent.searchParams.get("hashtags")).toBe("kyaa");
  });
});
