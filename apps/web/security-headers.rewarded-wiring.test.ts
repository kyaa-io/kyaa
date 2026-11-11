import { describe, expect, it } from "vitest";
import { rewardedExchangeDecision } from "@/features/group-wallet/rewarded-config";
import { adsenseEnabled, ADSENSE_SCRIPT_SRC, awsStorageContentSecurityPolicy } from "./security-headers";

const session = {
  KYAA_REWARDED_AD_SESSION_TTL_SECONDS: "600",
  KYAA_REWARDED_AD_MIN_WATCH_SECONDS: "5",
  KYAA_REWARDED_AD_ISSUE_LIMIT: "5",
  KYAA_REWARDED_AD_ISSUE_WINDOW_SECONDS: "3600",
  KYAA_REWARDED_AD_DAILY_CAP: "10",
};
const testUnit = "/22639388115/rewarded_web_example";

function csp(env: Record<string, string>) {
  return awsStorageContentSecurityPolicy({ rewardedAds: rewardedExchangeDecision(env as never).enabled });
}

describe("rewarded decision drives the CSP the proxy sends", () => {
  it("opens Google ad origins only when flag, unit and session values are all set", () => {
    const on = { KYAA_REWARDED_AD_UNIT: testUnit, KYAA_REWARDED_TICKET_EXCHANGE_ENABLED: "true", ...session };
    expect(csp(on)).toContain("securepubads.g.doubleclick.net");
  });
  it("stays closed for a unit without the flag, a flag without session values, and no settings", () => {
    expect(csp({ KYAA_REWARDED_AD_UNIT: testUnit, ...session })).not.toContain("securepubads");
    expect(csp({ KYAA_REWARDED_AD_UNIT: testUnit, KYAA_REWARDED_TICKET_EXCHANGE_ENABLED: "true" })).not.toContain("securepubads");
    expect(csp({})).not.toContain("securepubads");
  });
});

describe("AdSense site ownership snippet (사용자 12:26)", () => {
  it("opens only for the production origin", () => {
    expect(adsenseEnabled("https://kyaa.io")).toBe(true);
    for (const origin of ["https://dev.kyaa.io", "https://www.kyaa.io", "http://kyaa.io", "http://localhost:3000", "https://kyaa.io.evil.test", ""]) expect(adsenseEnabled(origin)).toBe(false);
  });
  it("adds the snippet's origin to script-src only when asked, and keeps the client id", () => {
    const on = awsStorageContentSecurityPolicy({ adsense: true });
    expect(on).toMatch(/script-src [^;]*https:\/\/pagead2\.googlesyndication\.com/);
    expect(on).toMatch(/connect-src [^;]*https:\/\/pagead2\.googlesyndication\.com/);
    expect(awsStorageContentSecurityPolicy({})).not.toContain("pagead2.googlesyndication.com");
    expect(ADSENSE_SCRIPT_SRC).toBe("https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6764620785144038");
  });
});
