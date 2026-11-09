import "server-only";
import { z } from "zod";
import { AuthError } from "@/features/auth/domain/auth-errors";
import { celebritySlugSchema } from "@/features/fanpage/domain/community";
import { prepareRichPostBody, richDocumentForPost, RICH_DOCUMENT_MAX_BYTES } from "@/components/editor/rich-document";
import { WAVE_FANPAGE_SLUG } from "@/features/fanpage/domain/wave-programs";
import { postTitleSlots } from "@/features/fan-posts/domain/post-title-slots";
import { type FanPost, slotTranslationSchema, postReactionInputSchema, postReactionSchema, assetSchema, blocksSchema, commentSchema, createCommentSchema, boardCreatePostSchema, boardEditPostSchema, postAttachmentPolicySchema, noticeSchema, postSchema, reportInputSchema, adminReportSchema, adminReportSummarySchema, targetSchema, translationInputSchema, translationSchema } from "@/features/fan-posts/domain/content";
import { boundedJson, boundedMultipart, CertificationBodyError, json } from "@/server/certification/certification-http";
import { MAX_PUBLIC_IMAGE_BYTES, MAX_PUBLIC_IMAGE_MULTIPART_BYTES, PublicImageError } from "@/server/media/public-image-processing";
import type { FanpageDependencies } from "@/server/fanpage/routes";
import type { AppLocale } from "@/i18n/locales";
import { parseNoticeDocument } from "@/server/notice/notice-domain";
import { awardDukjilAction, awardDukjilActionDetailed, dukjilBodyParams, dukjilSkipReason, type DukjilSkip } from "@/server/dukjil/award";
import type { DukjilActionResult } from "@/features/passport/domain/dukjil-types";

export interface ContentDependencies extends FanpageDependencies {
  upload(owner: string, slug: string, bytes: Uint8Array): Promise<z.infer<typeof assetSchema>>;
  download(path: string, thumbnail?: boolean): Promise<Blob>;
  translate(text: string, locale: AppLocale): Promise<{ translatedText: string; detectedSourceLocale?: string }>;
  /** One provider call for several texts; the answer has one entry per text, in order. */
  translateTexts(texts: readonly string[], locale: AppLocale): Promise<Array<{ translatedText: string; detectedSourceLocale?: string }>>;
}
const cursorSchema = z.object({ at: z.iso.datetime({ offset: true }), id: z.uuid(), pinned: z.boolean().optional() }).strict();
const postCursorSchema = z.union([
  z.object({ at: z.iso.datetime({ offset: true }), id: z.uuid() }).strict(),
  z.object({ sort: z.literal("latest"), at: z.iso.datetime({ offset: true }), id: z.uuid() }).strict(),
  z.object({ sort: z.literal("popular"), score: z.number().int().nonnegative(), at: z.iso.datetime({ offset: true }), id: z.uuid() }).strict(),
]);
const writeSchema = z.object({ id: z.uuid(), revision: z.number().int().positive(), replayed: z.boolean() }).strict();
// Optional so older clients keep working; present only when the server confirmed a granted, positive amount.
const rewardReadSchema = z.object({ amount: z.number().int().nonnegative() }).strict();
function checked<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new Error("FAN_WEB_UNAVAILABLE");
  return result.data;
}

/**
 * The reader's own reaction, and the dislike count only when the database says this reader may see it.
 * The post stays readable without it: a failed read leaves both fields out, which shows no count.
 */
async function withReaction(deps: Pick<ContentDependencies, "rpc">, owner: string | null, post: FanPost): Promise<FanPost> {
  let raw: unknown;
  try { raw = await deps.rpc("read_fan_post_reaction", { p_app_user_id: owner, p_post_id: post.id }); } catch { return post; }
  const reaction = postReactionSchema.safeParse(raw);
  return reaction.success ? { ...post, reaction: reaction.data.reaction, dislikeCount: reaction.data.dislikeCount } : post;
}

// Best-effort fan activity reward (contract §11-B). Verification inputs go in params; the policy decides. Never throws.
const RICH_POST_REQUEST_BYTES = RICH_DOCUMENT_MAX_BYTES + 32_768;
/** The board title stays the first line of `body`; the rest of `body` is derived from the sanitized document, never taken from the client. */
function richBoardBody(value: { body: string; assetIds: string[]; bodyDoc?: unknown }, slug: string) {
  if (value.bodyDoc === undefined) return null;
  const title = value.body.split("\n")[0]?.trim() ?? "";
  if (!title || slug === WAVE_FANPAGE_SLUG) throw new SyntaxError("rich body unavailable");
  const prepared = prepareRichPostBody({ document: value.bodyDoc, assetIds: value.assetIds, maxPlainLength: 4999 - title.length });
  return { ...prepared, body: `${title}\n${prepared.body}`.trim() };
}
const bodyParams = dukjilBodyParams;
// A path id is any-case (z.uuid()); the reward keys use the database's lowercase form, so one post is one key and the self-like check matches.
const rewardKeyId = (id: string) => id.toLowerCase();
async function awardForPost(deps: Pick<ContentDependencies, "rpc">, owner: string | null, postId: string, actionKey: "comment" | "reaction", sourceKey: string, params: Record<string, unknown>) {
  if (!owner) return null;
  try {
    const raw = await deps.rpc("read_fan_post", { p_app_user_id: owner, p_post_id: postId, p_locale: "ko" });
    const slug = (raw as { post?: { celebritySlug?: unknown } } | null)?.post?.celebritySlug;
    if (typeof slug !== "string") return null;
    return await awardDukjilAction(deps, { appUserId: owner, creatorSlug: slug, actionKey, sourceKey, params });
  } catch { /* the original action already succeeded */ return null; }
}
// 261107-2 D6: the comment award with the reason a refusal carried (the post's slug comes from the post, like awardForPost).
async function awardCommentDetailed(deps: Pick<ContentDependencies, "rpc">, owner: string | null, postId: string, sourceKey: string, params: Record<string, unknown>) {
  if (!owner) return null;
  try {
    const raw = await deps.rpc("read_fan_post", { p_app_user_id: owner, p_post_id: postId, p_locale: "ko" });
    const slug = (raw as { post?: { celebritySlug?: unknown } } | null)?.post?.celebritySlug;
    return typeof slug === "string" ? await awardDukjilActionDetailed(deps, { appUserId: owner, creatorSlug: slug, actionKey: "comment", sourceKey, params }) : null;
  } catch { return null; }
}
// 261107-2 D6: what the screen needs right after a mission write, in the one reward shape every mission write answers with
// (post, comment, like, share proof): { points, stamps, skippedReason? }. A fresh grant says what it paid; a refusal the fan can act on
// says why with points 0. Without a mission grant the older registration reward read still answers. No reward key when nothing applies.
async function missionReward(deps: Pick<ContentDependencies, "rpc">, owner: string | null, write: z.infer<typeof writeSchema>,
  award: { result: { points: number; stampId: string | null; replayed: boolean; capped: boolean; reason: string | null } | null; skipped?: DukjilSkip } | null): Promise<{ reward?: { points: number; stamps: number; skippedReason?: DukjilSkip } }> {
  const result = award?.result;
  // A stamp the write really placed is reported even when the points were capped (stamps is always a number).
  if (result && !result.replayed && (result.points > 0 || result.stampId)) return { reward: { points: result.points, stamps: result.stampId ? 1 : 0 } };
  const skipped = award?.skipped ?? (result && !result.replayed ? awardSkip(result) : undefined);
  const legacy = await readReward(deps, owner, write);
  if (legacy.reward) return { reward: { points: legacy.reward.points, stamps: 0 } };
  return skipped ? { reward: { points: 0, stamps: 0, skippedReason: skipped } } : {};
}
/** Tests only. */
export const missionRewardForTest = (...args: Parameters<typeof missionReward>) => missionReward(...args);
const REWARD_READ_TIMEOUT_MS = 800;
// Reads the just-granted points after the write has committed. Never throws: a failed read must not turn a committed post or
// comment into an error, and a replayed (idempotent) request must not replay the reward.
/** One reward shape for post, comment and like responses (review r4): `{ points, stamps, skippedReason? }`. A fresh grant only;
 * a replay says nothing, and a write the policy declined says why with points 0. */
export type ResponseReward = { points: number; stamps: number; skippedReason?: DukjilSkip };
/** The one name for why a granted action paid nothing: any daily cap (POINT_CAP, STAMP_CAP) is `daily_limit`. */
function awardSkip(award: { capped: boolean; reason: string | null }): DukjilSkip | undefined {
  return award.capped ? "daily_limit" : award.reason ? dukjilSkipReason(award.reason) : undefined;
}
function rewardFromAward(award: DukjilActionResult | null, points = award?.points ?? 0): { reward: ResponseReward } | Record<string, never> {
  if (!award || award.replayed) return points > 0 ? { reward: { points, stamps: 0 } } : {};
  const stamps = award.stampId ? 1 : 0;
  if (points > 0 || stamps > 0) return { reward: { points, stamps } };
  const skippedReason = awardSkip(award);
  return skippedReason ? { reward: { points: 0, stamps: 0, skippedReason } } : {};
}
async function readReward(deps: Pick<ContentDependencies, "rpc">, owner: string | null, write: z.infer<typeof writeSchema>, award: DukjilActionResult | null = null) {
  if (write.replayed || !owner) return {};
  const stamps = award && !award.replayed && award.stampId ? 1 : 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // A slow read must not delay the already committed write: after the limit the reward is simply omitted.
    const timeout = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), REWARD_READ_TIMEOUT_MS); });
    const raw = await Promise.race([deps.rpc("read_owned_fan_post_reward", { p_app_user_id: owner, p_source_id: write.id }), timeout]);
    const parsed = rewardReadSchema.safeParse(raw);
    // The ledger read is the amount; the award result adds the stamp and why nothing was paid.
    return rewardFromAward(award, parsed.success ? parsed.data.amount : 0);
  } catch { return rewardFromAward(award, 0); } finally { if (timer) clearTimeout(timer); }
}
function one(url: URL, name: string) {
  const all = url.searchParams.getAll(name);
  if (all.length > 1) throw new Error("FAN_WEB_INVALID_INPUT");
  return all[0];
}
function pageParams(request: Request, official = false) {
  const url = new URL(request.url), encoded = one(url, "cursor");
  let cursor: z.infer<typeof cursorSchema> | null = null;
  if (encoded !== undefined) {
    try { cursor = cursorSchema.parse(JSON.parse(Buffer.from(z.string().min(1).max(240).parse(encoded), "base64url").toString("utf8"))); }
    catch { throw new Error("FAN_WEB_INVALID_INPUT"); }
    if (official ? cursor.pinned === undefined : cursor.pinned !== undefined) throw new Error("FAN_WEB_INVALID_INPUT");
  }
  return { p_before: cursor?.at ?? null, p_before_id: cursor?.id ?? null, p_limit: z.coerce.number().int().min(1).max(50).parse(one(url, "limit") ?? 20), p_locale: z.enum(["ko", "en"]).parse(one(url, "locale") ?? "ko"), ...(official ? { p_before_pinned: cursor?.pinned ?? null } : {}) };
}
function postPageParams(request: Request) {
  const url = new URL(request.url), encoded = one(url, "cursor");
  const sort = z.enum(["latest", "popular"]).parse(one(url, "sort") ?? "latest");
  let cursor: z.infer<typeof postCursorSchema> | null = null;
  if (encoded !== undefined) {
    try { cursor = postCursorSchema.parse(JSON.parse(Buffer.from(z.string().min(1).max(240).parse(encoded), "base64url").toString("utf8"))); }
    catch { throw new Error("FAN_WEB_INVALID_INPUT"); }
    const cursorSort = "sort" in cursor ? cursor.sort : "latest";
    if (cursorSort !== sort) throw new Error("FAN_WEB_INVALID_INPUT");
  }
  return {
    p_before: cursor?.at ?? null,
    p_before_id: cursor?.id ?? null,
    p_before_score: cursor && "score" in cursor ? cursor.score : null,
    p_sort: sort,
    p_limit: z.coerce.number().int().min(1).max(50).parse(one(url, "limit") ?? 20),
    p_locale: z.enum(["ko", "en"]).parse(one(url, "locale") ?? "ko"),
  };
}
function page<T extends { id: string; createdAt: string }>(schema: z.ZodType<T>, raw: unknown) {
  const data = checked(z.object({ items: z.array(schema).max(50), hasMore: z.boolean() }).strict(), raw);
  const last = data.items.at(-1);
  return { items: data.items, nextCursor: data.hasMore && last ? Buffer.from(JSON.stringify({ at: last.createdAt, id: last.id })).toString("base64url") : null };
}
function postPage(raw: unknown, sort: "latest" | "popular") {
  const data = checked(z.object({ items: z.array(postSchema).max(50), hasMore: z.boolean() }).strict(), raw);
  const last = data.items.at(-1);
  const nextCursor = data.hasMore && last ? Buffer.from(JSON.stringify({
    sort,
    ...(sort === "popular" ? { score: last.likeCount + last.commentCount } : {}),
    at: last.createdAt,
    id: last.id,
  })).toString("base64url") : null;
  return { items: data.items, nextCursor };
}
export function contentFailure(error: unknown) {
  // A non-401 AuthError means the account itself is unavailable (suspended/deleted), not that the viewer is a non-member, so it must not look like FAN_WEB_FORBIDDEN (the join-guidance signal).
  if (error instanceof AuthError) return json({ error: { code: error.status === 401 ? "AUTHENTICATION_REQUIRED" : "FAN_WEB_ACTIVE_ACCOUNT_REQUIRED" } }, error.status);
  if (error instanceof z.ZodError || error instanceof SyntaxError) return json({ error: { code: "FAN_WEB_INVALID_INPUT" } }, 400);
  if (error instanceof CertificationBodyError) return json({ error: { code: error.code } }, error.code === "BODY_TOO_LARGE" ? 413 : 400);
  if (error instanceof PublicImageError) return json({ error: { code: error.code } }, error.code === "BODY_TOO_LARGE" ? 413 : 400);
  const code = error instanceof Error ? error.message : "";
  const statuses: Record<string, number> = { FAN_WEB_NOT_FOUND: 404, FAN_WEB_CONFLICT: 409, FAN_WEB_ACCOUNT_BUSY: 409, FAN_WEB_FORBIDDEN: 403, FAN_WEB_ACTIVE_ACCOUNT_REQUIRED: 403,
    CONTENT_REJECTED: 400, FAN_WEB_INVALID_INPUT: 400, FAN_WEB_INVALID_ASSET: 400, MEDIA_INVALID_ASSET: 400, FAN_WEB_PRIVATE_ASSET_REQUIRED: 400, FAN_WEB_RATE_LIMITED: 429,
    TRANSLATION_RATE_LIMITED: 429, TRANSLATION_INVALID_INPUT: 400, TRANSLATION_UNAVAILABLE: 503, TRANSLATION_FAILED: 503 };
  return json({ error: { code: statuses[code] ? code : "FAN_WEB_UNAVAILABLE" } }, statuses[code] ?? 503);
}
export function createContentHandlers(deps: ContentDependencies) {
  const owner = async (request: Request, optional = false) => optional && !request.headers.has("authorization") ? null : (await deps.authorize(request.headers.get("authorization"))).appUserId;
  const run = async (action: () => Promise<Response>) => { try { return await action(); } catch (error) { return contentFailure(error); } };
  return {
    periodRanking: (request: Request, slug: string) => run(async () => {
      celebritySlugSchema.parse(slug); const url=new URL(request.url),p_app_user_id=await owner(request,true);
      const p_period=z.enum(["day","week","month"]).parse(one(url,"period")??"day"),p_locale=z.enum(["ko","en"]).parse(one(url,"locale")??"ko");
      const data=checked(z.object({items:z.array(postSchema).max(10)}).strict(),await deps.rpc("read_fan_post_period_ranking",{p_app_user_id,p_slug:slug,p_period,p_locale}));
      return json(data);
    }),
    notices: (request: Request, slug: string) => run(async () => {
      celebritySlugSchema.parse(slug); const p_app_user_id = await owner(request, true);
      const data = checked(z.object({ notices: z.array(noticeSchema.omit({ body: true })).max(50), hasMore: z.boolean() }).strict(),
        await deps.rpc("read_fan_notices", { p_app_user_id, p_slug: slug, ...pageParams(request, true) }));
      const last = data.notices.at(-1);
      return json({ notices: data.notices, nextCursor: data.hasMore && last ? Buffer.from(JSON.stringify({ at: last.publishedAt, id: last.id, pinned: last.pinned })).toString("base64url") : null });
    }),
    notice: (request: Request, slug: string, noticeSlug: string) => run(async () => {
      celebritySlugSchema.parse(slug); celebritySlugSchema.parse(noticeSlug); const p_app_user_id = await owner(request, true);
      const raw = await deps.rpc("read_fan_notice", { p_app_user_id, p_slug: slug, p_notice_slug: noticeSlug, p_locale: pageParams(request).p_locale });
      if (raw === null) throw new Error("FAN_WEB_NOT_FOUND");
      const notice = checked(noticeSchema, raw);
      return json({ ...notice, body: parseNoticeDocument(notice.body) });
    }),
    attachmentPolicy: (request: Request, slug: string) => run(async () => { celebritySlugSchema.parse(slug); return json(checked(postAttachmentPolicySchema,await deps.rpc('read_fan_post_attachment_policy',{p_app_user_id:await owner(request),p_slug:slug}))); }),
    posts: (request: Request, slug: string) => run(async () => {
      celebritySlugSchema.parse(slug);
      const p_app_user_id = await owner(request, request.method === "GET");
      if (request.method === "GET") {
        const params = postPageParams(request);
        const raw = await deps.rpc("read_fan_posts", { p_app_user_id, p_slug: slug, ...params });
        if (raw === null) throw new Error("FAN_WEB_NOT_FOUND");
        return json(postPage(raw, params.p_sort));
      }
      const value = boardCreatePostSchema.parse(await boundedJson(request, RICH_POST_REQUEST_BYTES));
      const rich = richBoardBody(value, slug);
      const written = checked(writeSchema, await deps.rpc(rich ? "save_fan_post_rich" : "save_fan_post", { p_app_user_id, p_slug: slug, p_post_id: null, p_body: rich?.body ?? value.body, p_visibility: value.visibility,
        p_asset_ids: rich?.assetIds ?? value.assetIds, p_expected_revision: null, p_idempotency_key: value.idempotencyKey, ...(rich ? { p_body_doc: rich.document } : {}) }));
      const award = p_app_user_id && !written.replayed ? await awardDukjilActionDetailed(deps, { appUserId: p_app_user_id, creatorSlug: slug, actionKey: "post", sourceKey: written.id, params: bodyParams(rich?.body ?? value.body) }) : null;
      return json({ ...written, ...await missionReward(deps, p_app_user_id, written, award) }, 201);
    }),
    post: (request: Request, id: string) => run(async () => {
      z.uuid().parse(id);
      const p_app_user_id = await owner(request, request.method === "GET");
      if (request.method === "DELETE") { await deps.rpc("remove_fan_post", { p_app_user_id, p_post_id: id }); return json({ removed: true }); }
      const raw = await deps.rpc("read_fan_post", { p_app_user_id, p_post_id: id, p_locale: pageParams(request).p_locale });
      if (raw === null) throw new Error("FAN_WEB_NOT_FOUND");
      const data = checked(z.object({ post: postSchema }).strict(), raw);
      if (request.method === "GET") {
        data.post = await withReaction(deps, p_app_user_id, data.post);
        if (new URL(request.url).searchParams.get("format") !== "rich") return json(data);
        // The plain body stays readable if the document cannot be read, and the reader is told it is not the whole post.
        let stored: unknown;
        try { stored = await deps.rpc("read_fan_post_body_doc", { p_app_user_id, p_post_id: id }); }
        catch { return json({ post: { ...data.post, bodyDocUnavailable: true } }); }
        if (stored === null || stored === undefined) return json(data);
        const bodyDoc = richDocumentForPost(stored, data.post.body.split("\n").slice(1).join("\n"), [...data.post.assets.map(asset => asset.id), ...(data.post.video ? [data.post.video.id] : [])]);
        return json({ post: { ...data.post, ...(bodyDoc ? { bodyDoc } : { bodyDocUnavailable: true }) } });
      }
      const value = boardEditPostSchema.parse(await boundedJson(request, RICH_POST_REQUEST_BYTES));
      if (!data.post.isOwner) throw new Error("FAN_WEB_NOT_FOUND");
      const rich = richBoardBody(value, data.post.celebritySlug);
      return json(checked(writeSchema, await deps.rpc(rich ? "save_fan_post_rich" : "save_fan_post", { p_app_user_id, p_slug: data.post.celebritySlug, p_post_id: id, p_body: rich?.body ?? value.body,
        p_visibility: value.visibility, p_asset_ids: rich?.assetIds ?? value.assetIds, p_expected_revision: value.expectedRevision, p_idempotency_key: null, ...(rich ? { p_body_doc: rich.document } : {}) })));
    }),
    comments: (request: Request, id: string) => run(async () => {
      z.uuid().parse(id);
      const p_app_user_id = await owner(request, request.method === "GET");
      if (request.method === "GET") {
        const replies = z.enum(["replies"]).optional().parse(one(new URL(request.url), "fields")) === "replies";
        const raw = await deps.rpc(replies ? "read_fan_post_comments_replies" : "read_fan_post_comments", { p_app_user_id, p_post_id: id, ...pageParams(request) });
        if (raw === null) throw new Error("FAN_WEB_NOT_FOUND");
        return json(page(commentSchema, raw));
      }
      const value = createCommentSchema.parse(await boundedJson(request, 8192));
      const written = checked(writeSchema, await deps.rpc("post_fan_post_comment", { p_app_user_id, p_post_id: id, p_parent_id: value.parentId, p_body: value.body, p_idempotency_key: value.idempotencyKey }));
      const award = written.replayed ? null : await awardCommentDetailed(deps, p_app_user_id, id, written.id, { ...bodyParams(value.body), isReply: value.parentId != null, targetKey: rewardKeyId(id) });
      return json({ ...written, ...await missionReward(deps, p_app_user_id, written, award) }, 201);
    }),
    removeComment: (request: Request, id: string) => run(async () => {
      z.uuid().parse(id); const p_app_user_id = await owner(request);
      await deps.rpc("remove_fan_post_comment", { p_app_user_id, p_comment_id: id }); return json({ removed: true });
    }),
    like: (request: Request, id: string) => run(async () => {
      z.uuid().parse(id); const p_app_user_id = await owner(request);
      const value = postReactionInputSchema.parse(await boundedJson(request, 1024));
      if ("liked" in value) {
        await deps.rpc("set_fan_post_like", { p_app_user_id, p_post_id: id, p_liked: value.liked });
        // Only a like pays; the source is the post, so cancel and re-click never pays twice.
        if (value.liked) await awardForPost(deps, p_app_user_id, id, "reaction", `post-like:${rewardKeyId(id)}`, {});
        return json(value);
      }
      const result = checked(postReactionSchema, await deps.rpc("set_fan_post_reaction", { p_app_user_id, p_post_id: id, p_reaction: value.reaction }));
      const award = result.reaction === "like" ? await awardForPost(deps, p_app_user_id, id, "reaction", `post-like:${rewardKeyId(id)}`, {}) : null;
      // 261107-2 D8: a fresh grant goes back so the screen can celebrate it; a replay or a capped like says nothing.
      return json(award && !award.replayed ? { ...result, ...rewardFromAward(award) } : result);
    }),
    upload: (request: Request) => run(async () => {
      const actor = (await owner(request))!;
      const form = await boundedMultipart(request, MAX_PUBLIC_IMAGE_MULTIPART_BYTES), entries = [...form.entries()];
      if (entries.length !== 2 || form.getAll("file").length !== 1 || form.getAll("celebritySlug").length !== 1) throw new Error("FAN_WEB_INVALID_INPUT");
      const slug = celebritySlugSchema.parse(form.get("celebritySlug")), file = form.get("file");
      if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function") throw new Error("FAN_WEB_INVALID_INPUT");
      if (file.size > MAX_PUBLIC_IMAGE_BYTES) throw new PublicImageError("BODY_TOO_LARGE");
      return json({ asset: checked(assetSchema, await deps.upload(actor, slug, new Uint8Array(await file.arrayBuffer()))) }, 201);
    }),
    asset: (request: Request, id: string) => run(async () => {
      z.uuid().parse(id); const p_app_user_id = await owner(request, true);
      const url = new URL(request.url), adminPreview = one(url, "admin");
      const thumbnail = z.enum(["thumbnail"]).optional().parse(one(url, "size")) === "thumbnail";
      let raw: unknown;
      if (adminPreview !== undefined) {
        if (adminPreview !== "1") throw new Error("FAN_WEB_INVALID_INPUT");
        const admin = await deps.authorizeAdmin(request.headers.get("authorization"), crypto.randomUUID());
        raw = await deps.rpc("read_admin_content_asset", { p_actor_app_user_id: admin.appUserId, p_actor_admin_allowlist_id: admin.allowlistId, p_asset_id: id });
      } else raw = await deps.rpc("read_content_asset", { p_app_user_id, p_asset_id: id });
      if (raw === null) throw new Error("FAN_WEB_NOT_FOUND");
      const value = checked(z.object({ storagePath: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/), mimeType: z.literal("image/webp") }).strict(), raw);
      const bytes = await deps.download(value.storagePath, thumbnail);
      return new Response(bytes, { headers: { "content-type": value.mimeType, "cache-control": "private, no-store", vary: "Authorization", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'" } });
    }),
    report: (request: Request) => run(async () => {
      const p_app_user_id = await owner(request), value = reportInputSchema.parse(await boundedJson(request, 8192));
      return json(checked(z.object({ id: z.uuid(), status: z.enum(["open", "resolved", "dismissed"]), replayed: z.boolean() }).strict(),
        await deps.rpc("post_content_report", { p_app_user_id, p_target_type: value.targetType, p_target_id: value.targetId, p_reason: value.reason, p_idempotency_key: value.idempotencyKey })));
    }),
    blocks: (request: Request) => run(async () => {
      const p_app_user_id = await owner(request);
      if (request.method === "GET") return json(checked(blocksSchema, await deps.rpc("read_content_blocks", { p_app_user_id, p_locale: pageParams(request).p_locale })));
      const value = targetSchema.parse(await boundedJson(request, 1024));
      return json(checked(z.object({ id: z.uuid() }).strict(), await deps.rpc("block_content_author", { p_app_user_id, p_target_type: value.targetType, p_target_id: value.targetId })));
    }),
    unblock: (request: Request, id: string) => run(async () => {
      z.uuid().parse(id); const p_app_user_id = await owner(request);
      await deps.rpc("remove_content_block", { p_app_user_id, p_block_id: id }); return json({ removed: true });
    }),
    translate: (request: Request) => run(async () => {
      const p_app_user_id = await owner(request), value = translationInputSchema.parse(await boundedJson(request, 2048));
      const args = { p_app_user_id, p_target_type: value.targetType, p_target_id: value.targetId, p_target_locale: value.targetLocale, p_locale: value.locale };
      if (value.slots) {
        if (value.targetType !== "fan_post") throw new Error("FAN_WEB_INVALID_INPUT");
        // The slots come from the source text, and the cache holds one row per slot. A whole-text row is never read here.
        const raw = await deps.rpc("fan_web_content_target", { p_app_user_id, p_target_type: value.targetType, p_target_id: value.targetId, p_locale: value.locale });
        if (raw === null) throw new Error("FAN_WEB_NOT_FOUND");
        const target = checked(z.object({ body: z.string(), revision: z.number().int().positive(), sourceHash: z.string().regex(/^[a-f0-9]{64}$/) }), raw);
        const slots = postTitleSlots(target.body), count = slots.reduce((sum, item) => sum + Array.from(item.text).length, 0);
        if (slots.length === 0 || count > 20_000) throw new Error("TRANSLATION_INVALID_INPUT");
        const cachedSlots = await deps.rpc("read_content_translation_slots", args);
        if (cachedSlots !== null) return json(checked(slotTranslationSchema, cachedSlots));
        await deps.rpc("reserve_content_translation_request", { p_app_user_id, p_character_count: count });
        const results = await deps.translateTexts(slots.map(item => item.text), value.targetLocale);
        if (results.length !== slots.length) throw new Error("TRANSLATION_FAILED");
        await deps.rpc("save_content_translation_slots", { ...args, p_source_revision: target.revision, p_source_hash: target.sourceHash,
          p_slots: Object.fromEntries(slots.map((item, index) => [item.slot, results[index].translatedText])), p_detected_source_locale: results[0].detectedSourceLocale ?? null });
        // Recheck after provider latency, as the whole-text path does. Concurrent misses keep the first stored value, and every response reads it back.
        const stored = await deps.rpc("read_content_translation_slots", args);
        if (stored === null) throw new Error("FAN_WEB_CONFLICT");
        return json({ ...checked(slotTranslationSchema, stored), cached: false });
      }
      const cached = await deps.rpc("read_content_translation", args);
      if (cached !== null) return json(checked(translationSchema, cached));
      const raw = await deps.rpc("fan_web_content_target", { p_app_user_id, p_target_type: value.targetType, p_target_id: value.targetId, p_locale: value.locale });
      if (raw === null) throw new Error("FAN_WEB_NOT_FOUND");
      const target = checked(z.object({ body: z.string(), revision: z.number().int().positive(), sourceHash: z.string().regex(/^[a-f0-9]{64}$/) }), raw);
      const count = Array.from(target.body).length;
      if (!target.body.trim() || count > 20_000) throw new Error("TRANSLATION_INVALID_INPUT");
      await deps.rpc("reserve_content_translation_request", { p_app_user_id, p_character_count: count });
      const result = await deps.translate(target.body, value.targetLocale);
      await deps.rpc("save_content_translation", { ...args, p_source_revision: target.revision, p_source_hash: target.sourceHash, p_translated_text: result.translatedText, p_detected_source_locale: result.detectedSourceLocale ?? null });
      // Recheck after provider latency; source mutation, blocks, or deletion cannot return a stale translation.
      const current = await deps.rpc("read_content_translation", args);
      if (current === null) throw new Error("FAN_WEB_CONFLICT");
      return json({ ...checked(translationSchema, current), cached: false });
    }),
    adminReports: (request: Request) => run(async () => {
      const actor = await deps.authorizeAdmin(request.headers.get("authorization"), crypto.randomUUID());
      const { p_locale: _locale, ...params } = pageParams(request);
      const status = z.enum(["open", "resolved", "dismissed"]).parse(one(new URL(request.url), "status") ?? "open");
      return json(page(adminReportSchema, await deps.rpc("read_admin_content_reports", { p_actor_app_user_id: actor.appUserId, p_actor_admin_allowlist_id: actor.allowlistId, p_status: status, ...params })));
    }),
    adminReportSummary: (request: Request) => run(async () => {
      const actor = await deps.authorizeAdmin(request.headers.get("authorization"), crypto.randomUUID());
      return json(checked(adminReportSummarySchema, await deps.rpc("read_admin_content_report_summary", { p_actor_app_user_id: actor.appUserId, p_actor_admin_allowlist_id: actor.allowlistId })));
    }),
    resolveReport: (request: Request, id: string) => run(async () => {
      z.uuid().parse(id); const correlation = crypto.randomUUID(), actor = await deps.authorizeAdmin(request.headers.get("authorization"), correlation);
      if (actor.role === "viewer") throw new Error("FAN_WEB_FORBIDDEN");
      const value = z.object({ resolution: z.enum(["resolved", "dismissed"]), hideTarget: z.boolean(), restrictAuthor: z.boolean().default(false), reason: z.string().trim().min(10).max(500) }).strict().parse(await boundedJson(request, 8192));
      if (value.restrictAuthor && actor.role !== "admin") throw new Error("FAN_WEB_FORBIDDEN");
      return json(checked(z.object({ id: z.uuid(), status: z.enum(["resolved", "dismissed"]), targetHidden: z.boolean() }).strict(), await deps.rpc("resolve_admin_content_report", {
        p_actor_app_user_id: actor.appUserId, p_actor_admin_allowlist_id: actor.allowlistId, p_correlation_id: correlation, p_report_id: id, p_resolution: value.resolution, p_hide_target: value.hideTarget, p_reason: value.reason, p_restrict_author: value.restrictAuthor })));
    }),
  };
}
