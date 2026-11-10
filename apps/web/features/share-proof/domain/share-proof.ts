import { z } from "zod";

// 261107-2 D12 (+ review r4 H2). POST /api/me/share-proofs { creator, url, ownPost: true } and GET /api/me/share-proofs?creator=slug.
// Only the five networks the supervisor approved. A post is reduced to the network's own post id, so the same post written as
// p/ or reel/, watch?v= or shorts/ or youtu.be, with tracking query, another letter case in the host or path words, a trailing
// slash or the mobile host is one key. The id keeps its letter case (YouTube and Instagram ids are case sensitive).
export const SHARE_PLATFORMS = ["instagram", "tiktok", "x", "threads", "youtube"] as const;
export type SharePlatform = typeof SHARE_PLATFORMS[number];

/**
 * DUKJIL-POLICY ④ (2026-11-11): a share proof pays only after an operator sees the post tag the official account. These are the
 * accounts the site itself links (footer, structured data). TikTok and YouTube have no confirmed official account yet, so a proof on
 * them stays pending and cannot be accepted; add the handle here only once the account is confirmed, never from a guess.
 */
export const SHARE_OFFICIAL_TAGS: Readonly<Record<SharePlatform, string | null>> = { instagram: "@kyaa_app", x: "@kyaa_app", threads: "@kyaa_app", tiktok: null, youtube: null };
export const SHARE_TAG_PLATFORMS: readonly SharePlatform[] = SHARE_PLATFORMS.filter(platform => SHARE_OFFICIAL_TAGS[platform] !== null);
export const SHARE_PROOF_STATUSES = ["pending", "accepted", "rejected", "revoked"] as const;
export const SHARE_REJECT_CODES = ["no_hashtag", "private_account", "duplicate", "unrelated"] as const;

/**
 * Hosts, after lower-casing and dropping a trailing dot. Only the listed names are accepted: the bare domain, `www.`, and the
 * mobile names each network really serves (`m.` for Instagram, TikTok, YouTube and Twitter, `mobile.` for X and Twitter).
 * Any other sub-domain (l.instagram.com, music.youtube.com) is refused. youtu.be is YouTube's own address for one video id.
 */
export const SHARE_HOSTS: Readonly<Record<string, SharePlatform>> = {
  "instagram.com": "instagram", "www.instagram.com": "instagram", "m.instagram.com": "instagram",
  "tiktok.com": "tiktok", "www.tiktok.com": "tiktok", "m.tiktok.com": "tiktok",
  "x.com": "x", "www.x.com": "x", "mobile.x.com": "x", "twitter.com": "x", "www.twitter.com": "x", "mobile.twitter.com": "x", "m.twitter.com": "x",
  "threads.net": "threads", "www.threads.net": "threads", "threads.com": "threads", "www.threads.com": "threads",
  "youtube.com": "youtube", "www.youtube.com": "youtube", "m.youtube.com": "youtube", "youtu.be": "youtube",
};
/** Short links and redirectors hide the post: the fan is asked for the post's full address instead. */
export const SHARE_SHORT_HOSTS: readonly string[] = ["vm.tiktok.com", "vt.tiktok.com", "t.co", "bit.ly", "goo.gl", "tinyurl.com", "l.instagram.com", "lm.facebook.com", "l.facebook.com", "naver.me", "han.gl", "me2.do", "url.kr", "linktr.ee", "buff.ly", "ow.ly", "is.gd", "cutt.ly"];

const ID = {
  instagram: /^[A-Za-z0-9_-]{6,40}$/,
  tiktok: /^\d{15,25}$/,
  x: /^\d{10,25}$/,
  threads: /^[A-Za-z0-9_-]{6,40}$/,
  youtube: /^[A-Za-z0-9_-]{11}$/,
} as const;

function postId(platform: SharePlatform, path: string[], url: URL, host: string): string | null {
  const lower = path.map(part => part.toLowerCase());
  const after = (...markers: string[]) => { const index = lower.findIndex(part => markers.includes(part)); return index >= 0 ? path[index + 1] ?? null : null; };
  switch (platform) {
    // instagram.com/p/CODE, /reel/CODE, /reels/CODE, /tv/CODE, also /<user>/p/CODE
    case "instagram": return lower.slice(0, 2).some(part => ["p", "reel", "reels", "tv"].includes(part)) ? after("p", "reel", "reels", "tv") : null;
    // tiktok.com/@user/video/ID or /@user/photo/ID
    case "tiktok": return path[0]?.startsWith("@") ? after("video", "photo") : null;
    // x.com/<user>/status/ID, x.com/i/web/status/ID
    case "x": return lower[1] === "status" || (lower[0] === "i" && lower[1] === "web" && lower[2] === "status") ? after("status") : null;
    // threads.net/@user/post/CODE
    case "threads": return path[0]?.startsWith("@") && lower[1] === "post" ? path[2] ?? null : null;
    // youtube.com/watch?v=ID, /shorts/ID, /live/ID, youtu.be/ID
    case "youtube": return host === "youtu.be" ? path.length === 1 ? path[0]! : null
      : lower[0] === "watch" && path.length === 1 ? url.searchParams.get("v") : ["shorts", "live"].includes(lower[0] ?? "") && path.length === 2 ? path[1]! : null;
  }
}

export type ShareProofUrl = { platform: SharePlatform; url: string; key: string; id: string };
export type ShareProofUrlProblem = "short" | "unsupported" | "not_post";
export type ShareProofUrlCheck = { ok: true; value: ShareProofUrl } | { ok: false; problem: ShareProofUrlProblem };

/** The address a fan pasted, checked and reduced to `platform:id`. */
export function checkShareProofUrl(input: string): ShareProofUrlCheck {
  const text = input.trim();
  if (!text || text.length > 600 || /\s/.test(text)) return { ok: false, problem: "unsupported" };
  let url: URL;
  try { url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`); } catch { return { ok: false, problem: "unsupported" }; }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (SHARE_SHORT_HOSTS.includes(host)) return { ok: false, problem: "short" };
  const platform = SHARE_HOSTS[host];
  if (!platform || url.protocol !== "https:" || url.username || url.password || url.port) return { ok: false, problem: "unsupported" };
  let path: string[];
  try { path = url.pathname.split("/").filter(Boolean).map(part => decodeURIComponent(part)); } catch { return { ok: false, problem: "not_post" }; }
  const id = postId(platform, path, url, host);
  if (!id || !ID[platform].test(id)) return { ok: false, problem: "not_post" };
  // The stored address drops tracking query and fragment; YouTube's watch address keeps its video id.
  const clean = new URL(url.href);
  clean.hash = ""; clean.search = ""; clean.hostname = host;
  if (platform === "youtube" && host !== "youtu.be" && path[0]?.toLowerCase() === "watch") clean.searchParams.set("v", id);
  return { ok: true, value: { platform, url: clean.href, key: `${platform}:${id}`, id } };
}
export const parseShareProofUrl = (input: string): ShareProofUrl | null => { const checked = checkShareProofUrl(input); return checked.ok ? checked.value : null; };

export const shareProofSubmitSchema = z.object({
  creator: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120), url: z.string().trim().min(8).max(600),
  /** The fan's confirmation that they posted it themselves; required. */
  ownPost: z.literal(true),
}).strict();
export const shareProofItemSchema = z.object({
  id: z.uuid(), platform: z.enum(SHARE_PLATFORMS), url: z.string(), points: z.number().int().nonnegative().nullable(), createdAt: z.string(),
  status: z.enum(SHARE_PROOF_STATUSES),
}).strict();
export type ShareProofItem = z.infer<typeof shareProofItemSchema>;
export const shareProofListSchema = z.object({ items: z.array(shareProofItemSchema).max(50) }).strict();
/** A submission only records the proof (status "pending"); nothing is paid before an operator accepts it. duplicate: the post is already an Instagram repost of this member (B3). */
export const shareProofResultSchema = z.object({ id: z.uuid(), replayed: z.boolean(), status: z.enum(SHARE_PROOF_STATUSES), duplicate: z.literal(true).optional() }).strict();
export type ShareProofResult = z.infer<typeof shareProofResultSchema>;

// Admin list (GET /api/admin/share-proofs) and cancel (POST /api/admin/share-proofs/{id}/revoke).
export const adminShareProofSchema = z.object({
  id: z.uuid(), createdAt: z.string(), status: z.enum(SHARE_PROOF_STATUSES), platform: z.enum(SHARE_PLATFORMS), url: z.string().nullable(), postId: z.string(),
  revision: z.number().int().nonnegative(), rejectCode: z.enum(SHARE_REJECT_CODES).nullable(),
  points: z.number().int().nonnegative().nullable(), creator: z.object({ slug: z.string(), name: z.string() }).strict(), member: z.object({ id: z.uuid(), nickname: z.string().nullable() }).strict(),
  /** Other members who submitted the same post: the cue that one of them may not be its author. */
  duplicateCount: z.number().int().nonnegative(),
  revokedAt: z.string().nullable(), revokeResult: z.string().nullable(),
}).strict();
export type AdminShareProof = z.infer<typeof adminShareProofSchema>;
/** hasMore is added by the route; the panel parses the route's answer with this same schema. */
export const adminShareProofListSchema = z.object({ items: z.array(adminShareProofSchema).max(100), hasMore: z.boolean().optional() }).strict();
/** POST /api/admin/share-proofs/{id}/review. An accepted proof is paid by the same request; reward answers what the payout did (paid points, or why nothing was paid). */
export const adminShareReviewBodySchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("accept"), revision: z.number().int().nonnegative() }).strict(),
  z.object({ decision: z.literal("reject"), revision: z.number().int().nonnegative(), rejectCode: z.enum(SHARE_REJECT_CODES) }).strict(),
]);
export const adminShareReviewResultSchema = z.object({
  id: z.uuid(), status: z.enum(["accepted", "rejected"]), replayed: z.boolean(),
  reward: z.object({ points: z.number().int().nonnegative(), skippedReason: z.enum(["too_short", "daily_limit", "same_body", "passport_required"]).optional() }).strict().optional(),
}).strict();
export const adminShareRevokeBodySchema = z.object({ reason: z.string().trim().min(3).max(300) }).strict();
export const adminShareRevokeResultSchema = z.object({ id: z.uuid(), replayed: z.boolean(), result: z.enum(["corrected", "review", "stamp_voided", "none", "replayed"]) }).strict();
