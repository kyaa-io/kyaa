/**
 * The one SNS link a fan may put on their profile. Only https addresses with a plain domain pass: no other schemes,
 * no sign-in parts, no ports and no IP hosts. The same rule is checked again in SQL (20261215040000).
 */
export const FAN_SNS_URL_MAX = 300;
export const FAN_BIO_MAX = 60;

const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/;
const PLATFORMS: Record<string, string> = {
  "instagram.com": "Instagram", "x.com": "X", "twitter.com": "X", "tiktok.com": "TikTok", "youtube.com": "YouTube",
  "threads.net": "Threads", "threads.com": "Threads", "facebook.com": "Facebook", "weibo.com": "Weibo", "bsky.app": "Bluesky",
  "blog.naver.com": "Naver Blog", "chzzk.naver.com": "CHZZK", "soop.co.kr": "SOOP", "twitch.tv": "Twitch",
};

/** The trimmed address when it passes, else null. The address keeps its own bytes, so a query or hash the fan wrote stays. */
export function parseFanSnsUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > FAN_SNS_URL_MAX || /\s/.test(trimmed) || !/^https:\/\//i.test(trimmed)) return null;
  let url: URL;
  try { url = new URL(trimmed); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || url.port || !HOST.test(url.hostname)) return null;
  // The raw text must start with the parsed host, so nothing before it (like a backslash trick) changes where it goes.
  if (!trimmed.toLowerCase().startsWith(`https://${url.hostname}`)) return null;
  const rest = trimmed.slice(`https://${url.hostname}`.length);
  return rest === "" || rest.startsWith("/") ? trimmed : null;
}

/** What the profile shows for the link: the platform and the handle when the host is a known one, else the host. */
export function fanSnsLabel(value: string): string {
  const url = new URL(value);
  const host = url.hostname.toLowerCase().replace(/^(www|m)\./, "");
  const platform = PLATFORMS[host];
  const handle = url.pathname.split("/").filter(Boolean)[0]?.replace(/^@/, "");
  if (!platform) return host;
  if (!handle || /^(channel|c|user|profile\.php)$/.test(handle)) return platform;
  try { return `${platform} @${decodeURIComponent(handle)}`; } catch { return platform; }
}

/** One line, no control characters, at most 60 characters after trimming. Empty means none. */
export function parseFanBio(value: string): string | null | undefined {
  const trimmed = value.trim();
  if (!trimmed) return null;
  // eslint-disable-next-line no-control-regex
  if ([...trimmed].length > FAN_BIO_MAX || /[\u0000-\u001f\u007f]/.test(trimmed)) return undefined;
  return trimmed;
}
