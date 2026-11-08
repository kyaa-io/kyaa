import { z } from "zod";

// 261107-2 D12. POST /api/me/share-proofs { creator, url } and GET /api/me/share-proofs?creator=slug.
export const SHARE_PLATFORMS = ["instagram", "x", "tiktok", "youtube", "threads", "facebook", "weverse", "naver_blog", "naver_cafe", "daum_cafe", "bluesky"] as const;
export type SharePlatform = typeof SHARE_PLATFORMS[number];

type Rule = { hosts: readonly string[]; platform: SharePlatform; post: (path: string[], url: URL, host: string) => string | null };
const after = (path: string[], marker: string) => { const index = path.indexOf(marker); return index >= 0 && path[index + 1] ? path[index + 1] : null; };
// A post, not a profile or a home page: each network's post address shape. The returned id becomes the key, so the same post
// written with or without "www.", tracking query or trailing slash is one post.
const RULES: readonly Rule[] = [
  { platform: "instagram", hosts: ["instagram.com"], post: path => (["p", "reel", "reels", "tv"].includes(path[0] ?? "") && path[1] ? `${path[0] === "reels" ? "reel" : path[0]}/${path[1]}` : null) },
  { platform: "x", hosts: ["x.com", "twitter.com"], post: path => after(path, "status") },
  { platform: "tiktok", hosts: ["tiktok.com", "vm.tiktok.com", "vt.tiktok.com"], post: (path, _url, host) => after(path, "video") ?? after(path, "photo") ?? (host !== "tiktok.com" && path[0] ? `short/${path[0]}` : null) },
  { platform: "youtube", hosts: ["youtube.com", "youtu.be"], post: (path, url, host) => host === "youtu.be" ? path[0] ?? null : path[0] === "watch" ? url.searchParams.get("v") : path[0] === "shorts" || path[0] === "live" ? path[1] ?? null : path[0] === "post" ? path[1] ? `post/${path[1]}` : null : null },
  { platform: "threads", hosts: ["threads.net", "threads.com"], post: path => after(path, "post") },
  { platform: "facebook", hosts: ["facebook.com", "fb.watch"], post: (path, url, host) => host === "fb.watch" ? path[0] ?? null : after(path, "posts") ?? after(path, "videos") ?? (path[0] === "reel" ? path[1] ?? null : path[0] === "share" && path[2] ? `share/${path[1]}/${path[2]}` : url.searchParams.get("story_fbid")) },
  { platform: "weverse", hosts: ["weverse.io"], post: path => (path.length >= 3 ? path.slice(-2).join("/") : null) },
  { platform: "naver_blog", hosts: ["blog.naver.com"], post: (path, url) => url.searchParams.get("logNo") ? `${url.searchParams.get("blogId") ?? ""}/${url.searchParams.get("logNo")}` : path.length >= 2 && /^\d+$/.test(path[1]!) ? `${path[0]}/${path[1]}` : null },
  { platform: "naver_cafe", hosts: ["cafe.naver.com"], post: (path, url) => url.searchParams.get("articleid") ?? (path.length >= 2 && /^\d+$/.test(path.at(-1)!) ? path.slice(-2).join("/") : null) },
  { platform: "daum_cafe", hosts: ["cafe.daum.net"], post: path => (path.length >= 3 ? path.slice(-3).join("/") : null) },
  { platform: "bluesky", hosts: ["bsky.app"], post: path => (path[0] === "profile" && path[2] === "post" && path[1] && path[3] ? `${path[1]}/${path[3]}` : null) },
];

export type ShareProofUrl = { platform: SharePlatform; url: string; key: string };
/** The post address a fan pasted, checked and reduced to a key; null when it is not a post on a supported network. */
export function parseShareProofUrl(input: string): ShareProofUrl | null {
  const text = input.trim();
  if (!text || text.length > 600) return null;
  let url: URL;
  try { url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase().replace(/^(?:www|m|mobile)\./, "");
  const rule = RULES.find(candidate => candidate.hosts.includes(host));
  if (!rule) return null;
  const path = url.pathname.split("/").filter(Boolean).map(part => decodeURIComponent(part));
  const id = rule.post(path, url, host);
  if (!id || id.length > 300 || /[\s<>"]/.test(id)) return null;
  // Tracking query and fragment are dropped from the stored address too; the post stays reachable without them.
  const keep = new URL(url.href);
  keep.hash = "";
  for (const name of [...keep.searchParams.keys()]) if (!["v", "logNo", "blogId", "articleid", "story_fbid", "id"].includes(name)) keep.searchParams.delete(name);
  return { platform: rule.platform, url: keep.href, key: `${rule.platform}:${id.toLowerCase()}` };
}

export const shareProofSubmitSchema = z.object({ creator: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120), url: z.string().trim().min(8).max(600) }).strict();
export const shareProofItemSchema = z.object({ id: z.uuid(), platform: z.enum(SHARE_PLATFORMS), url: z.string(), points: z.number().int().nonnegative().nullable(), createdAt: z.string() }).strict();
export type ShareProofItem = z.infer<typeof shareProofItemSchema>;
export const shareProofListSchema = z.object({ items: z.array(shareProofItemSchema).max(50) }).strict();
/** The answer to a submission: the proof, what the share mission paid (absent when nothing was paid) and why not. */
export const shareProofResultSchema = z.object({
  id: z.uuid(), replayed: z.boolean(),
  reward: z.object({ points: z.number().int().positive(), stamps: z.number().int().nonnegative().optional() }).optional(),
  rewardSkipped: z.enum(["daily_limit", "passport_required", "too_short", "same_body"]).optional(),
}).strict();
export type ShareProofResult = z.infer<typeof shareProofResultSchema>;
