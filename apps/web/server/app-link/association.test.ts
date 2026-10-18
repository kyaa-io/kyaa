import { afterEach, describe, expect, it, vi } from "vitest";
import { appAssociationResponse } from "./association";

vi.mock("server-only", () => ({}));

const origin = "https://kyaa-internal-sallylab.vercel.app";
const certificate = Array(32).fill("AB").join(":");
afterEach(() => vi.unstubAllEnvs());

describe("mobile domain association", () => {
  it("only publishes configured app identities on the exact isolated origin", async () => {
    vi.stubEnv("MOBILE_APP_LINK_ORIGIN", origin);
    vi.stubEnv("APPLE_TEAM_ID", "7RFN3TFR5K");
    vi.stubEnv("MOBILE_ANDROID_SHA256_CERTIFICATES", certificate);
    const request = new Request(`${origin}/.well-known/apple-app-site-association`);
    const apple = appAssociationResponse(request, "apple");
    expect(apple.status).toBe(200);
    const body = await apple.json();
    expect(body.applinks.details[0].appIDs).toEqual(["7RFN3TFR5K.kr.kyaa.app"]);
    expect(body.applinks.details[0].components).toContainEqual({ "/": "/open-app" });
    expect(body.applinks.details[0].components).not.toContainEqual({ "/": "/*" });
    expect((await appAssociationResponse(request, "android").json())[0].target).toEqual({ namespace: "android_app", package_name: "kr.kyaa.app", sha256_cert_fingerprints: [certificate] });
    expect(appAssociationResponse(new Request("https://byus.kr/.well-known/assetlinks.json"), "android").status).toBe(404);
  });

  it("fails closed for absent or malformed configuration", () => {
    const request = new Request(`${origin}/.well-known/assetlinks.json`);
    vi.stubEnv("MOBILE_APP_LINK_ORIGIN", "");
    expect(appAssociationResponse(request, "android").status).toBe(404);
    vi.stubEnv("MOBILE_APP_LINK_ORIGIN", origin);
    vi.stubEnv("MOBILE_ANDROID_SHA256_CERTIFICATES", "not-a-certificate");
    vi.stubEnv("APPLE_TEAM_ID", "invalid");
    expect(appAssociationResponse(request, "android").status).toBe(404);
    expect(appAssociationResponse(request, "apple").status).toBe(404);
  });
});
