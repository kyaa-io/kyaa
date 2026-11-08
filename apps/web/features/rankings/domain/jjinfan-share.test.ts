import { describe, expect, it } from "vitest";
import { jjinfanShareImagePath, jjinfanShareUrl } from "./jjinfan-share";

describe("jjinfan share link", () => {
  it("opens the fan page with the common UTM shape and no member value", () => {
    const url = new URL(jjinfanShareUrl("https://kyaa.io/", "elina", "ja"));
    expect(url.pathname).toBe("/elina");
    expect(Object.fromEntries(url.searchParams)).toEqual({ locale: "ja", share: "jjinfan", utm_source: "kyaa", utm_medium: "share", utm_campaign: "elina", utm_content: "jjinfan_gauge.share" });
  });
  it("falls back to the kyaa campaign for a slug outside the campaign pattern", () => {
    expect(new URL(jjinfanShareUrl("https://kyaa.io", "a".repeat(81), "ko")).searchParams.get("utm_campaign")).toBe("kyaa");
  });
  it("names the preview image by count so a moved count is a new address", () => {
    expect(jjinfanShareImagePath("elina", 47, "ko")).toBe("/share/jjinfan/elina?locale=ko&n=47");
    expect(jjinfanShareImagePath("elina", -3.7, "en")).toBe("/share/jjinfan/elina?locale=en&n=0");
  });
});
