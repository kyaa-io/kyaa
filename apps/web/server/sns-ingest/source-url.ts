import { createHash } from "node:crypto";

export const snsIngestPlatforms = ["instagram", "tiktok"] as const;
export type SnsIngestPlatform = (typeof snsIngestPlatforms)[number];

const hosts: Record<SnsIngestPlatform, ReadonlySet<string>> = {
  instagram: new Set(["instagram.com", "www.instagram.com", "m.instagram.com"]),
  tiktok: new Set(["tiktok.com", "www.tiktok.com", "m.tiktok.com"]),
};

const accountPatterns: Record<SnsIngestPlatform, RegExp> = {
  instagram: /^\/([A-Za-z0-9._]{1,30})\/?$/,
  tiktok: /^\/@([A-Za-z0-9._]{1,30})\/?$/,
};

// Post URLs must carry the account handle so the source account can be checked.
const postPatterns: Record<SnsIngestPlatform, RegExp> = {
  instagram: /^\/([A-Za-z0-9._]{1,30})\/(?:p|reel)\/([A-Za-z0-9_-]{5,64})\/?$/,
  tiktok: /^\/@([A-Za-z0-9._]{1,30})\/(?:video|photo)\/([0-9]{5,32})\/?$/,
};

function httpsUrl(value: string, platform: SnsIngestPlatform): URL | null {
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash) return null;
  return hosts[platform].has(url.hostname) ? url : null;
}

export function parseAccountUrl(platform: SnsIngestPlatform, value: string): { handle: string } | null {
  const url = httpsUrl(value, platform);
  const match = url && accountPatterns[platform].exec(url.pathname);
  return match ? { handle: match[1]!.toLowerCase() } : null;
}

export function parsePostUrl(platform: SnsIngestPlatform, value: string): { handle: string; sourceId: string } | null {
  const url = httpsUrl(value, platform);
  const match = url && postPatterns[platform].exec(url.pathname);
  return match ? { handle: match[1]!.toLowerCase(), sourceId: match[2]! } : null;
}

/** Same rule as the collector's stableSlug: `<platform>-<sha256(sourceId) first 16 hex>`. */
export function snsIngestSlug(platform: SnsIngestPlatform, sourceId: string): string {
  return `${platform}-${createHash("sha256").update(sourceId).digest("hex").slice(0, 16)}`;
}

const imageHostPatterns = [
  /(^|\.)cdninstagram\.com$/,
  /(^|\.)fbcdn\.net$/,
  /(^|\.)tiktokcdn(?:-[a-z]{2,8})?\.com$/,
];

export function allowedImageUrl(value: string): URL | null {
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  return imageHostPatterns.some(pattern => pattern.test(url.hostname)) ? url : null;
}
