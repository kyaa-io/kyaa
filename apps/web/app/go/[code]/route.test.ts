import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, HEAD } from "./route";

vi.mock("server-only", () => ({}));

const fetcher = vi.fn();
const home = "https://kyaa.io/";
const request = (code: string, headers: HeadersInit = {}) => new Request(
  `${home}go/${code}?utm_campaign=spoofed&email=private`,
  { headers: { referer: "https://example.org/?email=private", ...headers } },
);
const context = (code: string) => ({ params: Promise.resolve({ code }) });

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://database.example");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");
  vi.stubGlobal("fetch", fetcher);
  fetcher.mockReset().mockImplementation(async () => new Response(null, { status: 201 }));
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("outbound short links", () => {
  it.each([
    ["vtuber", "streamer_outreach"],
    ["idol", "idol_outreach_kr"],
    ["idol-jp", "idol_outreach_jp"],
    ["news", "newstip"],
    ["ig", "instagram_dm"],
  ])("redirects %s with the configured campaign and stores only that campaign", async (code, campaign) => {
    const response = await GET(request(code), context(code));
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`${home}?utm_source=x&utm_medium=dm&utm_campaign=${campaign}`);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0][0])).toBe("https://database.example/rest/v1/outbound_link_visits");
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ campaign: campaign.replaceAll("_", "-") });
  });

  it.each(["unknown", "constructor", "__proto__"])("redirects unknown code %s without attribution", async (code) => {
    const response = await GET(request(code), context(code));
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(home);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(["Twitterbot/1.0", "facebookexternalhit/1.1", "meta-externalagent/1.1", "kakaotalk-scrap/1.0"])(
    "sends %s to the home preview without recording a visit", async (userAgent) => {
      const response = await GET(request("ig", { "user-agent": userAgent }), context("ig"));
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe(home);
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["mail-raffle", "s/raffle?utm_source=email&utm_medium=email&utm_campaign=raffle_mail", "mail-raffle"],
    ["newstip", "?utm_source=newstip&utm_medium=email&utm_campaign=newstip", "newstip"],
    ["x-dm", "?utm_source=x&utm_medium=dm&utm_campaign=dm_outreach", "x-dm"],
    ["soompi", "?utm_source=soompi&utm_medium=referral&utm_campaign=media", "soompi"],
    ["kol-alina", "s/raffle?utm_source=x&utm_medium=kol&utm_campaign=alina&utm_content=kol-alina", "kol-alina"],
    ["qr-run-music", "?utm_source=qr&utm_medium=offline&utm_campaign=run_music", "qr-run-music"],
    ["sweeps-giveaway-frenzy", "s/raffle?utm_source=giveaway_frenzy&utm_medium=referral&utm_campaign=sweeps_listing", "sweeps-giveaway-frenzy"],
  ])("opens %s with its own tags and records the code", async (code, location, visit) => {
    const response = await GET(request(code), context(code));
    expect(response.headers.get("location")).toBe(`${home}${location}`);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ campaign: visit });
  });

  it.each(["qr-", "qr-Run", "qr-a--b", "sweeps-x_y", `qr-${"a".repeat(60)}`, "kol-unknown"])("treats %s as unknown", async (code) => {
    expect((await GET(request(code), context(code))).headers.get("location")).toBe(home);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("gives a link preview the raffle page without tags", async () => {
    const response = await GET(request("kol-luna", { "user-agent": "Twitterbot/1.0" }), context("kol-luna"));
    expect(response.headers.get("location")).toBe(`${home}s/raffle`);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("skips speculative requests and HEAD", async () => {
    await GET(request("ig", { "sec-purpose": "prefetch" }), context("ig"));
    expect((await HEAD(request("ig"), context("ig"))).status).toBe(302);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("redirects even when recording fails", async () => {
    fetcher.mockResolvedValue(new Response(null, { status: 500 }));
    expect((await GET(request("news"), context("news"))).status).toBe(302);
    expect(console.error).toHaveBeenCalledWith("outbound_link_visit_failed", { campaign: "newstip" });
  });
});
