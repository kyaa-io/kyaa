import { captureSignupSource } from "./signup-source";
import { describe, expect, it } from "vitest";

import {
  acquisitionLanding,
  classifyAcquisitionChannel,
  readStoredAcquisitionTouch,
} from "./acquisition-attribution";

describe("acquisition attribution", () => {
  it("allows only public acquisition landing shapes and never retains a slug", () => {
    expect(acquisitionLanding("/")).toBe("home");
    expect(acquisitionLanding("/s/raffle")).toBe("benefit");
    expect(acquisitionLanding("/s/raffle/")).toBe("benefit");
    expect(acquisitionLanding("/c/elina")).toBe("creator");
    expect(acquisitionLanding("/elina")).toBe("creator");
    expect(acquisitionLanding("/ifewknow")).toBe("creator");
    expect(acquisitionLanding("/creator")).toBeNull();
    expect(acquisitionLanding("/live/private-live-code")).toBe("live");
    expect(acquisitionLanding("/guide")).toBe("fan_guide");
    expect(acquisitionLanding("/c/elina/raffles")).toBe("benefit");
    expect(acquisitionLanding("/c/elina/raffles/")).toBe("benefit");
    expect(acquisitionLanding("/c/elina/raffles/gift-id")).toBe("benefit");
    expect(acquisitionLanding("/c/elina/raffles/gift-id/enter")).toBeNull();
    expect(acquisitionLanding("/settings/kakao/callback")).toBeNull();
    expect(acquisitionLanding("/login")).toBeNull();
    expect(acquisitionLanding("/admin/dashboard")).toBeNull();
  });

  it.each(["community", "kol"])("attributes raffle rules visits to %s", medium => {
    expect(acquisitionLanding("/s/raffle/rules")).toBe("benefit");
    expect(classifyAcquisitionChannel({
      searchParams: new URLSearchParams({ utm_medium: medium }),
      referrer: "https://www.reddit.com/",
      siteOrigin: "https://kyaa.io",
    })).toBe(medium);
  });

  it("reduces query and referrer inputs to a bounded channel", () => {
    const secretQuery = new URLSearchParams({
      utm_source: "person@example.com",
      utm_campaign: "private-campaign-name",
      utm_medium: "social",
      code: "oauth-secret",
    });
    const channel = classifyAcquisitionChannel({
      searchParams: secretQuery,
      referrer: "https://private.example/path?token=secret",
      siteOrigin: "https://byus.kr",
    });

    expect(channel).toBe("social");
    expect(JSON.stringify({ channel })).not.toMatch(/person@example|private-campaign|oauth-secret|private\.example/);
    expect(classifyAcquisitionChannel({
      searchParams: new URLSearchParams(),
      referrer: "https://www.google.com/search?q=private",
      siteOrigin: "https://byus.kr",
    })).toBe("search");
    expect(classifyAcquisitionChannel({
      searchParams: new URLSearchParams("gclid=do-not-store"),
      referrer: "",
      siteOrigin: "https://byus.kr",
    })).toBe("paid");
  });

  it("fails closed on tampered session storage", () => {
    expect(readStoredAcquisitionTouch("not-json")).toBeNull();
    expect(readStoredAcquisitionTouch(JSON.stringify({
      channel: "person@example.com",
      landing: "/c/private-slug",
      anonymousRecorded: false,
      identifiedRecorded: false,
      eventNonce: crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
    }))).toBeNull();
  });
});

it("keeps only registered campaign values and a public route template", () => {
  const params = new URLSearchParams("utm_source=x&utm_medium=community&utm_campaign=raffle-1125&utm_content=private@example.com");
  expect(captureSignupSource("/benefits/private-id", params, "https://t.co/private?token=secret")).toEqual({
    referrerHost: "t.co",
    utmSource: "x",
    utmMedium: "community",
    utmCampaign: "raffle-1125",
    landingPath: "/benefits/:benefit",
  });
});

it("keeps the channel link tags from the raffle link sheet", () => {
  const capture = (query: string) => captureSignupSource("/s/raffle", new URLSearchParams(query), "");
  expect(capture("utm_source=telegram&utm_medium=community&utm_campaign=raffle-1125&utm_content=tg-channel")).toEqual({
    utmSource: "telegram", utmMedium: "community", utmCampaign: "raffle-1125", utmContent: "tg-channel", landingPath: "/s/raffle",
  });
  expect(capture("utm_source=supertoday&utm_medium=referral&utm_content=supertoday")).toMatchObject({
    utmSource: "supertoday", utmMedium: "referral", utmContent: "supertoday",
  });
  expect(capture("utm_source=x&utm_medium=kol&utm_content=kol-alina")).toMatchObject({ utmMedium: "kol", utmContent: "kol-alina" });
  expect(capture("utm_source=google&utm_medium=paid&utm_content=g-kw-giveaway")).toMatchObject({ utmContent: "g-kw-giveaway" });
  expect(capture("utm_source=localvibe&utm_content=localvibe-banner")).toMatchObject({
    utmSource: "localvibe", utmContent: "localvibe-banner",
  });
  expect(capture("utm_source=koreapas&utm_content=koreapas-post")).toMatchObject({ utmSource: "koreapas", utmContent: "koreapas-post" });
  expect(capture("utm_source=discord&utm_content=discord")).toMatchObject({ utmSource: "discord", utmContent: "discord" });
  expect(capture("utm_content=kol-private@example.com")).toEqual({ landingPath: "/s/raffle" });
});
