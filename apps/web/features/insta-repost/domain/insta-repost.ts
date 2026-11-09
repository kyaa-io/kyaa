import { z } from "zod";
import { checkShareProofUrl, type ShareProofUrlProblem } from "@/features/share-proof/domain/share-proof";

// B3 §5.2. The Instagram repost mission: POST /api/me/insta-reposts, GET /api/me/insta-reposts?creator=slug, the review queue and
// decisions for admins (/api/admin/insta-reposts) and fan page owners/managers (/api/groups/{id}/insta-reposts).
export const INSTA_POST_KINDS = ["feed", "reel", "story"] as const;
export const INSTA_REJECT_CODES = ["no_hashtag", "private_account", "duplicate", "unrelated"] as const;
export const INSTA_REPOST_STATUSES = ["pending", "accepted", "rejected", "revoked"] as const;
export const INSTA_PAY_RESULTS = ["paid", "point_cap", "month_cap", "account_inactive"] as const;
export const instaPostKindSchema = z.enum(INSTA_POST_KINDS);
export const instaRejectCodeSchema = z.enum(INSTA_REJECT_CODES);
export const instaRepostStatusSchema = z.enum(INSTA_REPOST_STATUSES);
export const instaPayResultSchema = z.enum(INSTA_PAY_RESULTS);

export type InstaRepostUrl = { url: string; key: string };
export type InstaRepostUrlCheck = { ok: true; value: InstaRepostUrl } | { ok: false; problem: ShareProofUrlProblem };

/** A story address instagram.com/stories/<user>/<numeric id>, reduced to instagram-story:<id>. Feed and reels use the share proof
 * parser (instagram:<code>), so a post sent as a share proof and as a repost is one key. */
export function checkInstaRepostUrl(input: string, postKind: z.infer<typeof instaPostKindSchema>): InstaRepostUrlCheck {
  if (postKind !== "story") {
    const checked = checkShareProofUrl(input);
    if (!checked.ok) return checked;
    if (checked.value.platform !== "instagram") return { ok: false, problem: "unsupported" };
    return { ok: true, value: { url: checked.value.url, key: checked.value.key } };
  }
  const text = input.trim();
  let url: URL;
  try { url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`); } catch { return { ok: false, problem: "unsupported" }; }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!["instagram.com", "www.instagram.com", "m.instagram.com"].includes(host) || url.protocol !== "https:" || url.username || url.password || url.port) {
    return { ok: false, problem: host === "l.instagram.com" ? "short" : "unsupported" };
  }
  const path = url.pathname.split("/").filter(Boolean);
  if (path[0]?.toLowerCase() !== "stories" || path.length !== 3 || !/^[A-Za-z0-9._]{1,30}$/.test(path[1] ?? "") || !/^\d{6,30}$/.test(path[2] ?? "")) {
    return { ok: false, problem: "not_post" };
  }
  return { ok: true, value: { url: `https://www.instagram.com/stories/${path[1]}/${path[2]}/`, key: `instagram-story:${path[2]}` } };
}

export const instaRepostSubmitSchema = z.object({
  creator: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),
  postKind: instaPostKindSchema,
  url: z.string().trim().min(8).max(600).optional(),
  captureId: z.uuid().optional(),
  ownPost: z.literal(true),
}).strict().superRefine((value, context) => {
  if (value.postKind !== "story" && (!value.url || value.captureId)) context.addIssue({ code: "custom", path: ["url"], message: "Feed and reels are proven by their address" });
  if (value.postKind === "story" && !value.captureId) context.addIssue({ code: "custom", path: ["captureId"], message: "A story needs its capture" });
});
export const instaRepostSubmitResultSchema = z.object({ id: z.uuid(), status: instaRepostStatusSchema, replayed: z.boolean(), duplicate: z.boolean() }).strict();

export const instaRepostItemSchema = z.object({
  id: z.uuid(), status: instaRepostStatusSchema, postKind: instaPostKindSchema, url: z.string().nullable(), hasCapture: z.boolean(),
  rejectCode: instaRejectCodeSchema.nullable(), payResult: instaPayResultSchema.nullable(), points: z.number().int().nonnegative().nullable(),
  submittedAt: z.string(), reviewedAt: z.string().nullable(), revokedAt: z.string().nullable(),
}).strict();
export const instaRepostListSchema = z.object({ items: z.array(instaRepostItemSchema).max(50) }).strict();

export const instaRepostQueueItemSchema = z.object({
  id: z.uuid(), submittedAt: z.string(), status: instaRepostStatusSchema, postKind: instaPostKindSchema, url: z.string().nullable(), hasCapture: z.boolean(),
  revision: z.number().int().nonnegative(),
  creator: z.object({ slug: z.string(), name: z.string() }).strict(), member: z.object({ id: z.uuid(), nickname: z.string().nullable() }).strict(),
  duplicateCount: z.number().int().nonnegative(), rejectCode: instaRejectCodeSchema.nullable(), reviewedAt: z.string().nullable(),
  reviewerRole: z.enum(["admin", "page"]).nullable(), payResult: instaPayResultSchema.nullable(), points: z.number().int().nonnegative().nullable(),
  approvedAt: z.string().nullable(), clawedBack: z.boolean(), revokedAt: z.string().nullable(), revokeResult: z.string().nullable(),
}).strict();
export type InstaRepostQueueItem = z.infer<typeof instaRepostQueueItemSchema>;
export const instaRepostQueueSchema = z.object({ items: z.array(instaRepostQueueItemSchema).max(100) }).strict();
export const instaRepostQueueStatusSchema = z.enum(["pending", "accepted", "rejected", "revoked", "all"]);

export const instaRepostReviewBodySchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("accept"), revision: z.number().int().nonnegative() }).strict(),
  z.object({ decision: z.literal("reject"), revision: z.number().int().nonnegative(), rejectCode: instaRejectCodeSchema }).strict(),
]);
export const instaRepostReviewResultSchema = z.object({
  id: z.uuid(), status: z.enum(["accepted", "rejected"]), points: z.number().int().nonnegative(), payResult: instaPayResultSchema.nullable(), revision: z.number().int().nonnegative(),
}).strict();
