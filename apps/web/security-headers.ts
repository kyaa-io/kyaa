type ResponseHeader = { key: string; value: string };

const contentSecurityPolicy = [
  "default-src 'self'",
  // Next emits inline bootstrap scripts. Removing unsafe-inline requires a
  // request-scoped nonce architecture; keep the exception isolated here.
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""} https://challenges.cloudflare.com`,
  "style-src 'self' 'unsafe-inline'",
  // Published CMS records intentionally support administrator-approved HTTPS
  // artwork, plus data/blob previews.
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  // Sign-in is a top-level navigation to the Cognito Hosted UI (PRIVY-EXIT-0005): no auth frame or connection origin.
  `frame-src ${["https://challenges.cloudflare.com", "https://www.youtube.com", "https://www.tiktok.com"].join(" ")}`,
  [
    "connect-src 'self'",
    "https://*.tiktokcdn.com",
    "https://*.tiktokcdn-us.com",
  ].join(" "),
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  // Published LIVE previews are rights-reviewed derivatives in the public cms-assets bucket, served at
  // https://kyaa.io/public-assets. That is this site's own origin only on kyaa.io; dev and staging read it
  // cross-origin, so previews there need kyaa.io added here before they can play.
  "media-src 'self' blob:",
].join("; ");

export const responseSecurityHeaders: ResponseHeader[] = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  // Third-party pop-ups (share sheets, provider pages) may keep their opener.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  // Without includeSubDomains or preload: subdomain impact is unchecked (SECURITY-AUDIT A02). Browsers ignore it over http.
  ...(process.env.NODE_ENV === "development" ? [] : [{ key: "Strict-Transport-Security", value: "max-age=31536000" }]),
];

/** Runtime bucket names keep one image deployable across isolated environments. */
/** AdSense site ownership (사용자 12:26): the one adsbygoogle.js line every page carries, only on the production domain. */
export const ADSENSE_CLIENT = "ca-pub-6764620785144038";
export const ADSENSE_SCRIPT_SRC = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;
export const ADSENSE_ORIGIN = "https://kyaa.io";
/** The viewer's origin as the proxy sees it; the snippet and its CSP origins open only for https://kyaa.io. */
export function adsenseEnabled(viewerOrigin: string): boolean { return viewerOrigin === ADSENSE_ORIGIN; }

export function awsStorageContentSecurityPolicy(config: { bucket?: string; region?: string; stage?: boolean; rewardedAds?: boolean; ga4?: boolean; adsense?: boolean }): string {
  let policy = contentSecurityPolicy;
  // adsbygoogle.js and what it calls back to (Google's AdSense code snippet requirements).
  if (config.adsense) {
    policy = policy
      .replace("https://challenges.cloudflare.com", "https://challenges.cloudflare.com https://pagead2.googlesyndication.com https://*.adtrafficquality.google")
      .replace("frame-src ", "frame-src https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://*.adtrafficquality.google ")
      .replace("connect-src 'self'", "connect-src 'self' https://pagead2.googlesyndication.com https://*.adtrafficquality.google");
  }
  // GA4 origins open only where a GA4 stream is configured (GA4_MEASUREMENT_ID); gtag.js itself loads only after consent.
  if (config.ga4) {
    policy = policy
      .replace("https://challenges.cloudflare.com", "https://challenges.cloudflare.com https://www.googletagmanager.com")
      .replace("connect-src 'self'", "connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com");
  }
  // Google Publisher Tag origins load only once a rewarded ad unit is configured.
  if (config.rewardedAds) {
    policy = policy
      .replace("https://challenges.cloudflare.com", "https://challenges.cloudflare.com https://securepubads.g.doubleclick.net https://pagead2.googlesyndication.com https://tpc.googlesyndication.com https://www.googletagservices.com https://www.gstatic.com https://*.adtrafficquality.google")
      .replace("frame-src ", "frame-src https://*.doubleclick.net https://*.googlesyndication.com https://*.adtrafficquality.google https://www.google.com ")
      .replace("connect-src 'self'", "connect-src 'self' https://*.doubleclick.net https://*.googlesyndication.com https://*.adtrafficquality.google https://csi.gstatic.com")
      .replace("font-src 'self' data:", "font-src 'self' data: https://fonts.gstatic.com")
      .replace("style-src 'self' 'unsafe-inline'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com")
      .replace("media-src 'self' blob:", "media-src 'self' blob: https://*.gvt1.com");
  }
  if (config.region === "ap-northeast-2" && /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(config.bucket ?? "")) {
    policy = policy.replace("connect-src 'self'", `connect-src 'self' https://${config.bucket}.s3.${config.region}.amazonaws.com/mobile-media/`);
  }
  if (config.stage) policy = policy.replace("connect-src 'self'", "connect-src 'self' ws://127.0.0.1:*/source");
  return policy;
}
