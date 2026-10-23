import { describe, expect, it } from "vitest";
import { awsStorageContentSecurityPolicy, responseSecurityHeaders } from "./security-headers";
import { unstable_getResponseFromNextConfig } from "next/experimental/testing/server";
import nextConfig from "./next.config";

function header(name: string): string {
  const value = responseSecurityHeaders.find(
    ({ key }) => key.toLowerCase() === name.toLowerCase(),
  )?.value;
  expect(value, `${name} must be configured`).toBeTypeOf("string");
  return value as string;
}

describe("response security headers", () => {
  it.each([
    "/share/default.png",
    "/_next/image?url=https%3A%2F%2Fkyaa.io%2Fpublic-assets%2Fcms-assets%2Fbanner.jpg&w=1200&q=75",
    "/images/guest-home/banksy-exhibition-campaign.webp",
    "/kyaa-app-icon-512.png",
    "/_next/image?url=%2Fimages%2Fguest-home%2Fbanksy-exhibition-campaign.webp&w=1200&q=75",
    "/_next/image?url=https%3A%2F%2Fgmrykvmtmuaeswpajteq.supabase.co%2Fstorage%2Fv1%2Fobject%2Fpublic%2Fcms-assets%2Fbanner.jpg&w=1200&q=75",
    "/_next/image?url=https%3A%2F%2Fxcppyedwusirqnfpbtit.supabase.co%2Fstorage%2Fv1%2Fobject%2Fpublic%2Fcms-assets%2Fbanner.jpg&w=1200&q=75",
  ])("allows public share artwork to render on other sites: %s", async (path) => {
    const response = await unstable_getResponseFromNextConfig({ url: `https://kyaa.io${path}`, nextConfig });
    expect(response.headers.get("cross-origin-resource-policy")).toBe("cross-origin");
  });
  it.each([
    "/api/content-assets/asset-id",
    "/api/me/avatar",
    "/api/admin/session",
    "/my",
    "/_next/image?url=%2Fapi%2Fcontent-assets%2Fasset-id&w=1200&q=75",
    "/_next/image?url=%2Fimages%2F..%2Fapi%2Fcontent-assets%2Fasset-id&w=1200&q=75",
    "/_next/image?url=%2Fimages%2F%252e%252e%2Fapi%2Fcontent-assets%2Fasset-id&w=1200&q=75",
    "/_next/image?url=https%3A%2F%2Fexample.com%2Fprivate.jpg&w=1200&q=75",
    "/_next/image?url=https%3A%2F%2Fgmrykvmtmuaeswpajteq.supabase.co%2Fstorage%2Fv1%2Fobject%2Fauthenticated%2Fproofs%2Ffile.jpg&w=1200&q=75",
    "/_next/image?url=https%3A%2F%2Fgmrykvmtmuaeswpajteq.supabase.co%2Fstorage%2Fv1%2Fobject%2Fpublic%2Fcms-assets%2Fbanner.jpg%3Ftoken%3Dprivate&w=1200&q=75",
  ])("preserves isolation for personal resources: %s", async (path) => {
    const response = await unstable_getResponseFromNextConfig({ url: `https://kyaa.io${path}`, nextConfig });
    expect(response.headers.get("cross-origin-resource-policy")).toBe("same-origin");
  });

  it("allows app scripts on the connection landing while OAuth documents remain script-free", async () => {
    const landing = await unstable_getResponseFromNextConfig({ url: "https://byus.kr/connect/instagram", nextConfig });
    expect(landing.headers.get("content-security-policy")).toContain("https://auth.privy.io");
    expect(landing.headers.get("content-security-policy")).not.toContain("default-src 'none'");
    for (const route of ["start", "callback", "confirm", "deletion-status"]) {
      const document = await unstable_getResponseFromNextConfig({ url: `https://byus.kr/connect/instagram/${route}`, nextConfig });
      expect(document.headers.get("content-security-policy")).toContain("default-src 'none'");
      expect(document.headers.get("content-security-policy")).not.toContain("https://auth.privy.io");
    }
  });
  it("denies framing and constrains executable content", () => {
    const csp = header("Content-Security-Policy");

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("default-src *");
    expect(header("X-Frame-Options")).toBe("DENY");
  });

  it("allows only the loopback source socket on the exact stage route", async () => {
    const stage = await unstable_getResponseFromNextConfig({ url: "https://kyaa.io/admin/wave-stage?lang=ko", nextConfig });
    const policy = stage.headers.get("content-security-policy")!;
    expect(policy).toBe(header("Content-Security-Policy").replace("connect-src 'self'", "connect-src 'self' ws://127.0.0.1:*/source"));
    expect(policy.match(/connect-src/g)).toHaveLength(1);
    for (const path of ["/", "/admin", "/admin/wave-stage/other", "/api/admin/wave-stage", "/kyaa-wave-fanpage"]) {
      const response = await unstable_getResponseFromNextConfig({ url: `https://kyaa.io${path}`, nextConfig });
      expect(response.headers.get("content-security-policy")).toBe(header("Content-Security-Policy"));
    }
  });

  it("allows only the Privy integration origins required by the active login flow", () => {
    const csp = header("Content-Security-Policy");

    expect(csp).toContain("frame-src https://auth.privy.io");
    expect(csp).toContain("connect-src 'self' https://auth.privy.io");
    expect(csp).toContain("https://*.rpc.privy.systems");
    expect(csp).not.toContain("frame-src *");
    expect(csp).not.toContain("connect-src *");
  });

  it("allows signed private-media uploads only to the known storage paths", () => {
    const connect = header("Content-Security-Policy").split(";").find(value => value.trim().startsWith("connect-src "))!;
    const storage = connect.split(/\s+/).filter(source => source.includes("supabase"));
    expect(storage).toEqual([
      "https://gmrykvmtmuaeswpajteq.supabase.co/storage/v1/object/upload/sign/mobile-media/",
      "https://xcppyedwusirqnfpbtit.supabase.co/storage/v1/object/upload/sign/mobile-media/",
    ]);
  });

  it("allows published LIVE preview media from Supabase Storage", () => {
    const csp = header("Content-Security-Policy");

    expect(csp).toContain("media-src 'self' blob: https://*.supabase.co");
    expect(csp).not.toContain("media-src *");
  });

  it("allows official YouTube videos only as embedded frames", () => {
    const directives = header("Content-Security-Policy").split(";").map((value) => value.trim());
    expect(directives.find((value) => value.startsWith("frame-src "))).toContain("https://www.youtube.com");
    expect(directives.filter((value) => !value.startsWith("frame-src ")).join(";")).not.toContain("https://www.youtube.com");
  });

  it("sets MIME, referrer, capability, and cross-origin isolation policies", () => {
    expect(header("X-Content-Type-Options")).toBe("nosniff");
    expect(header("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(header("Permissions-Policy")).toBe(
      "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    );
    expect(header("Cross-Origin-Opener-Policy")).toBe(
      "same-origin-allow-popups",
    );
    expect(header("Cross-Origin-Resource-Policy")).toBe("same-origin");
  });
});

it("limits AWS upload CSP to the configured bucket and reserved media prefix", () => {
  const policy = awsStorageContentSecurityPolicy({bucket: "byus-dev-private", region: "ap-northeast-2"});
  expect(policy).toContain("https://byus-dev-private.s3.ap-northeast-2.amazonaws.com/mobile-media/");
  expect(policy).not.toContain("https://*.s3");
  expect(awsStorageContentSecurityPolicy({bucket: "evil; default-src *", region: "ap-northeast-2"})).not.toContain("evil");
  expect(awsStorageContentSecurityPolicy({bucket: "byus-dev-private", region: "us-east-1"})).not.toContain("s3.");
  expect(awsStorageContentSecurityPolicy({bucket: "byus-dev-private", region: "ap-northeast-2", stage: true})).toContain("ws://127.0.0.1:*/source");
});
