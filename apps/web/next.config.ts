import type { NextConfig } from "next";
import { publicImageRemotePatterns } from "./components/fan-ui/public-image-policy";
import { responseSecurityHeaders } from "./security-headers";
import { htmlLimitedBots } from "./seo/bots";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  htmlLimitedBots,
  images: { remotePatterns: publicImageRemotePatterns, qualities: [75, 90] },
  poweredByHeader: false,
  typedRoutes: true,
  serverExternalPackages: ["ffmpeg-static", "ffprobe-static"],
  // Sharp 0.35 moved its entry point; Next 16's native dependency tracing
  // misses libvips. Include the installed runtime assets for avatar routes.
  outputFileTracingIncludes: {
    "/api/me/avatar": ["../../node_modules/@img/sharp-libvips-*/**/*"],
    "/api/me/avatar/**": ["../../node_modules/@img/sharp-libvips-*/**/*"],
    "/api/me/media/**": [
      "../../node_modules/@img/sharp-libvips-*/**/*",
      "../../node_modules/ffmpeg-static/ffmpeg",
      `../../node_modules/ffprobe-static/bin/${process.platform}/${process.arch}/ffprobe`,
    ],
    "/api/internal/media/**": [
      "../../node_modules/@img/sharp-libvips-*/**/*",
      "../../node_modules/ffmpeg-static/ffmpeg",
      `../../node_modules/ffprobe-static/bin/${process.platform}/${process.arch}/ffprobe`,
    ],
  },
  async headers() {
    return [
      {
        source: "/:path((?!connect/instagram/).*)",
        headers: responseSecurityHeaders,
      },
      {
        source: "/admin/wave-stage",
        // The paired Mac host uses an ephemeral port and accepts only its source token and this origin.
        headers: responseSecurityHeaders.map((header) => header.key === "Content-Security-Policy"
          ? { ...header, value: header.value.replace("connect-src 'self'", "connect-src 'self' ws://127.0.0.1:*/source") }
          : header),
      },
      ...["/images/:path*", "/share/:path*", "/kyaa-app-icon-512.png"].map((source) => ({
        source,
        headers: [{ key: "Cross-Origin-Resource-Policy", value: "cross-origin" }],
      })),
      {
        source: "/_next/image",
        // Embed only known public artwork; optimizer URLs for private resources stay isolated.
        has: [{ type: "query", key: "url",
          value: `(?:(?:/(?:images|share)/|https://(?:${publicImageRemotePatterns.map(({ hostname }) => hostname.replaceAll(".", "\\.")).join("|")})/storage/v1/object/public/cms-assets/)(?!.*\\.\\.)[A-Za-z0-9/_.-]+|/kyaa-app-icon-512\\.png)` }],
        headers: [{ key: "Cross-Origin-Resource-Policy", value: "cross-origin" }],
      },
      {
        // OAuth flow documents supply their own hashed-style, script-free CSP.
        // A second global form-action 'self' would block their external 303.
        source: "/connect/instagram/:path+",
        headers: [
          ...responseSecurityHeaders.filter((header) => !["Content-Security-Policy", "Referrer-Policy"].includes(header.key)),
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Content-Security-Policy", value: "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https://www.instagram.com; base-uri 'none'; frame-ancestors 'none'" },
        ],
      },
    ];
  },
  async redirects() {
    return [
      { source: "/kyaa-wave/staff", destination: "/connect/kyaa-wave/staff", permanent: true },
      { source: "/kyaa-wave", destination: "/connect/kyaa-wave", permanent: true },
      { source: "/byus-day", destination: "/connect/kyaa-wave", permanent: true },
      { source: "/connect/byus-day", destination: "/connect/kyaa-wave", permanent: true },
      {
        source: "/live/elina-nualeaf-live/:path*",
        destination: "/live/elina-byus-live/:path*",
        permanent: true,
      },
      {
        source: "/live/changha-nualeaf-live/:path*",
        destination: "/live/changha-byus-live/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
