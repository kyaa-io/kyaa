import { describe, expect, it, vi } from "vitest";
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
    "/_next/image?url=https%3A%2F%2Fdev.kyaa.io%2Fpublic-assets%2Fcms-assets%2Fbanner.jpg&w=1200&q=75",
  ])("allows public share artwork to render on other sites: %s", async (path) => {
    const response = await unstable_getResponseFromNextConfig({ url: `https://kyaa.io${path}`, nextConfig });
    expect(response.headers.get("cross-origin-resource-policy")).toBe("cross-origin");
  });
  it("lets browsers keep checked-in artwork instead of revalidating on every visit", async () => {
    const response = await unstable_getResponseFromNextConfig({ url: "https://kyaa.io/images/guest-home/youtube.svg", nextConfig });
    expect(response.headers.get("cache-control")).toBe("public, max-age=3600");
    const personal = await unstable_getResponseFromNextConfig({ url: "https://kyaa.io/api/me/avatar", nextConfig });
    expect(personal.headers.get("cache-control") ?? "").not.toContain("public");
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
    "/_next/image?url=https%3A%2F%2Fgmrykvmtmuaeswpajteq.supabase.co%2Fstorage%2Fv1%2Fobject%2Fpublic%2Fcms-assets%2Fbanner.jpg&w=1200&q=75",
    "/_next/image?url=https%3A%2F%2Fkyaa.io%2Fpublic-assets%2Ffan-avatars%2Fprivate.webp&w=1200&q=75",
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

  it("opens no origin for the retired Supabase Storage hosts", () => {
    expect(header("Content-Security-Policy")).not.toContain("supabase");
    expect(awsStorageContentSecurityPolicy({ bucket: "byus-test-private", region: "ap-northeast-2", rewardedAds: true, ga4: true })).not.toContain("supabase");
  });

  it("serves published LIVE preview media from this site's own origin only", () => {
    const csp = header("Content-Security-Policy");

    expect(csp.endsWith("media-src 'self' blob:")).toBe(true);
    expect(csp).not.toContain("media-src *");
  });

  it("allows official YouTube videos only as embedded frames", () => {
    const directives = header("Content-Security-Policy").split(";").map((value) => value.trim());
    expect(directives.find((value) => value.startsWith("frame-src "))).toContain("https://www.youtube.com");
    expect(directives.find((value) => value.startsWith("frame-src "))).toContain("https://www.tiktok.com");
    expect(directives.filter((value) => !value.startsWith("frame-src ")).join(";")).not.toContain("https://www.youtube.com");
  });

  it("pins HTTPS for one year on every page and API response, without subdomains or preload", async () => {
    expect(header("Strict-Transport-Security")).toBe("max-age=31536000");
    for (const path of ["/", "/my", "/login", "/api/groups", "/connect/instagram/start"]) {
      const response = await unstable_getResponseFromNextConfig({ url: `https://kyaa.io${path}`, nextConfig });
      expect(response.headers.get("strict-transport-security"), path).toBe("max-age=31536000");
    }
  });
  it("leaves HSTS off local development, which runs on http", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "development");
    try {
      const development = await import("./security-headers");
      expect(development.responseSecurityHeaders.some(({ key }) => key === "Strict-Transport-Security")).toBe(false);
    } finally {
      vi.unstubAllEnvs();
    }
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

describe("rewarded ad content security policy", () => {
  it("allows Google Publisher Tag origins only when rewarded ads are configured", () => {
    expect(awsStorageContentSecurityPolicy({})).not.toContain("securepubads.g.doubleclick.net");
    const policy = awsStorageContentSecurityPolicy({ rewardedAds: true });
    expect(policy).toMatch(/script-src[^;]*https:\/\/securepubads\.g\.doubleclick\.net/);
    expect(policy).toMatch(/frame-src[^;]*https:\/\/\*\.doubleclick\.net/);
    expect(policy).toMatch(/connect-src[^;]*https:\/\/\*\.doubleclick\.net/);
  });
  it("adds the gstatic script origin and ad quality connect origin only with rewarded ads", () => {
    const policy = awsStorageContentSecurityPolicy({ rewardedAds: true });
    expect(policy).toMatch(/script-src[^;]*https:\/\/www\.gstatic\.com/);
    expect(policy).toMatch(/connect-src[^;]*https:\/\/\*\.adtrafficquality\.google/);
    for (const off of [awsStorageContentSecurityPolicy({}), awsStorageContentSecurityPolicy({ rewardedAds: false })]) {
      expect(off).not.toContain("gstatic.com");
      expect(off).not.toContain("adtrafficquality.google");
    }
  });
  it("pins the hosts the rewarded ad video, fonts and quality frames were observed to load", () => {
    const directive = (policy: string, name: string) => policy.split("; ").find((part) => part.startsWith(`${name} `)) ?? "";
    const on = awsStorageContentSecurityPolicy({ rewardedAds: true });
    const off = awsStorageContentSecurityPolicy({});
    expect(directive(on, "media-src")).toBe("media-src 'self' blob: https://*.gvt1.com");
    expect(directive(on, "font-src")).toBe("font-src 'self' data: https://fonts.gstatic.com");
    expect(directive(on, "style-src")).toBe("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com");
    expect(directive(on, "script-src")).toContain("https://*.adtrafficquality.google");
    expect(directive(on, "frame-src")).toContain("https://*.adtrafficquality.google");
    expect(directive(on, "frame-src")).toContain("https://www.google.com");
    expect(directive(on, "connect-src")).toContain("https://csi.gstatic.com");
    expect(directive(on, "media-src")).not.toMatch(/\*(\s|$)|https:(\s|$)/);
    // Without rewarded ads the directives keep their previous values.
    expect(directive(off, "media-src")).toBe("media-src 'self' blob:");
    expect(directive(off, "font-src")).toBe("font-src 'self' data:");
    expect(off).not.toContain("gvt1.com");
    // Every previous source stays when rewarded ads are on.
    for (const part of off.split("; ")) {
      const name = part.split(" ")[0];
      for (const source of part.split(" ").slice(1)) expect(directive(on, name)).toContain(source);
    }
  });
});

it("opens the GA4 origins only where a GA4 stream is configured", () => {
  const off = awsStorageContentSecurityPolicy({ bucket: "byus-dev-private", region: "ap-northeast-2" });
  const on = awsStorageContentSecurityPolicy({ bucket: "byus-dev-private", region: "ap-northeast-2", ga4: true });
  expect(off).not.toContain("googletagmanager");
  expect(off).not.toContain("google-analytics");
  const directive = (policy: string, name: string) => policy.split("; ").find((part) => part.startsWith(`${name} `)) ?? "";
  expect(directive(on, "script-src")).toContain("https://www.googletagmanager.com");
  expect(directive(on, "connect-src")).toContain("https://*.google-analytics.com");
  expect(directive(on, "connect-src")).toContain("https://*.analytics.google.com");
  expect(directive(on, "connect-src")).toContain("https://byus-dev-private.s3.ap-northeast-2.amazonaws.com/mobile-media/");
  expect(directive(on, "frame-src")).not.toContain("googletagmanager");
  expect(awsStorageContentSecurityPolicy({ ga4: true, rewardedAds: true })).toContain("https://securepubads.g.doubleclick.net");
});
