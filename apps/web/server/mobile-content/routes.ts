import "server-only";
import { fanRewardSchema } from "@/server/mobile-fan-economy/domain";

import { z } from "zod";
import { waveAlbumSchema } from "@/features/fanpage/domain/wave-media";
import { celebritySlugSchema } from "@/features/fanpage/domain/community";
import { boundedJson, json } from "@/server/certification/certification-http";
import { contentFailure } from "@/server/fan-posts/routes";
import { noticeSlugSchema } from "@/server/notice/notice-domain";
import {
  clipWriteResultSchema, commentReactionResultSchema, createClipCommentSchema, createFanClipSchema,
  fanClipCommentSchema, fanClipSchema, favoriteAlbumSchema, reactionEmojiSchema,
} from "./domain";

export interface MobileContentDependencies {
  authorize(authorization: string | null): Promise<{ appUserId: string }>;
  rpc(name: string, args: Record<string, unknown>): Promise<unknown>;
}

const cursorSchema = z.object({ at: z.iso.datetime({ offset: true }), id: z.uuid() }).strict();
const writeSchema = z.object({ id: z.uuid(), revision: z.number().int().positive(), replayed: z.boolean() }).strict();
const headers = { "cache-control": "private, no-store", vary: "Authorization" } as const;

function checked<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new Error("FAN_WEB_UNAVAILABLE");
  return result.data;
}

function one(url: URL, name: string) {
  const values = url.searchParams.getAll(name);
  if (values.length > 1) throw new SyntaxError("duplicate query parameter");
  return values[0];
}
function params(request: Request) {
  const url = new URL(request.url), encoded = one(url, "cursor");
  let cursor: z.infer<typeof cursorSchema> | null = null;
  if (encoded) {
    try { cursor = cursorSchema.parse(JSON.parse(Buffer.from(z.string().min(1).max(240).parse(encoded), "base64url").toString("utf8"))); }
    catch { throw new SyntaxError("invalid cursor"); }
  }
  if ([...url.searchParams.keys()].some(key => !["cursor", "limit", "locale"].includes(key))) throw new SyntaxError("invalid query");
  return {
    p_before: cursor?.at ?? null, p_before_id: cursor?.id ?? null,
    p_limit: z.coerce.number().int().min(1).max(50).parse(one(url, "limit") ?? 20),
    p_locale: z.enum(["ko", "en"]).parse(one(url, "locale") ?? "ko"),
  };
}
function locale(request: Request) {
  const url = new URL(request.url);
  if ([...url.searchParams.keys()].some(key => key !== "locale")) throw new SyntaxError("invalid query");
  return z.enum(["ko", "en"]).parse(one(url, "locale") ?? "ko");
}
function page<T extends { id: string; createdAt: string }>(schema: z.ZodType<T>, raw: unknown) {
  const parsed = checked(z.object({ items: z.array(schema).max(50), hasMore: z.boolean() }).strict(), raw);
  const last = parsed.items.at(-1);
  return { items: parsed.items, nextCursor: parsed.hasMore && last ? Buffer.from(JSON.stringify({ at: last.createdAt, id: last.id })).toString("base64url") : null };
}

export function createMobileContentHandlers(deps: MobileContentDependencies) {
  const owner = async (request: Request, optional = false) => optional && !request.headers.has("authorization") ? null : (await deps.authorize(request.headers.get("authorization"))).appUserId;
  const run = async (action: () => Promise<Response>) => { try { return await action(); } catch (error) { return contentFailure(error); } };
  const rewardResult = async (request: Request, result: z.infer<typeof clipWriteResultSchema>) => request.headers.get("X-Kyaa-Reward-Contract") === "fan-point-v1" ? { ...result, fanReward: checked(fanRewardSchema, await deps.rpc("read_owned_mobile_fan_reward", { p_app_user_id: await owner(request), p_source_id: result.id })) } : result;
  return {
    latestOfficialPost: (request: Request, slug: string) => run(async () => {
      celebritySlugSchema.parse(slug);
      const result = await deps.rpc("read_owned_mobile_latest_official_post", {
        p_app_user_id: await owner(request), p_slug: slug, p_locale: locale(request),
      });
      const schema = z.object({ id: z.uuid(), slug: noticeSlugSchema, title: z.string().trim().min(1).max(300),
        publishedAt: z.iso.datetime({ offset: true }), readAt: z.iso.datetime({ offset: true }).nullable() }).strict();
      return json({ post: result === null ? null : checked(schema, result) }, 200, headers);
    }),
    readOfficialPost: (request: Request, slug: string, noticeSlug: string) => run(async () => {
      celebritySlugSchema.parse(slug); noticeSlugSchema.parse(noticeSlug);
      z.object({}).strict().parse(await boundedJson(request, 1024));
      const readAt = await deps.rpc("mark_owned_mobile_official_post_read", {
        p_app_user_id: await owner(request), p_slug: slug, p_notice_slug: noticeSlug, p_locale: locale(request),
      });
      return json({ readAt: checked(z.iso.datetime({ offset: true }), readAt) }, 200, headers);
    }),
    favoriteAlbum: (request: Request, passportId: string) => run(async () => {
      z.uuid().parse(passportId);
      const raw = await deps.rpc("read_owned_mobile_favorite_album", {
        p_app_user_id: await owner(request), p_passport_id: passportId, ...params(request),
      });
      if (raw === null) throw new Error("FAN_WEB_NOT_FOUND");
      const parsed = checked(favoriteAlbumSchema, raw);
      const last = parsed.items.at(-1);
      return json({
        favorite: parsed.favorite, sourceAvailable: parsed.sourceAvailable, items: parsed.items,
        nextCursor: parsed.hasMore && last
          ? Buffer.from(JSON.stringify({ at: last.createdAt, id: last.id })).toString("base64url")
          : null,
      }, 200, headers);
    }),
    officialPostStatus: (request: Request, slug: string, requestId: string) => run(async () => {
      celebritySlugSchema.parse(slug); z.uuid().parse(requestId);
      const result = await deps.rpc("read_owned_mobile_official_post_result", { p_app_user_id: await owner(request), p_slug: slug, p_idempotency_key: requestId });
      return json({ result: result === null ? null : checked(writeSchema, result) }, 200, headers);
    }),
    officialPosts: (request: Request, slug: string) => run(async () => {
      celebritySlugSchema.parse(slug);
      const p_app_user_id = await owner(request);
      if (request.method === "GET") {
        const result = await deps.rpc("read_owned_mobile_official_capability", { p_app_user_id, p_slug: slug, p_locale: locale(request) });
        if (result === null) throw new Error("FAN_WEB_NOT_FOUND");
        return json(checked(z.object({ canPublish: z.boolean(), displayName: z.string().min(1).max(300), accountName: z.string().min(1).max(100).nullable() }).strict(), result), 200, headers);
      }
      const value = z.object({ body: z.string().trim().max(5000), assetIds: z.array(z.uuid()).max(4).refine(ids => new Set(ids).size === ids.length), idempotencyKey: z.uuid() }).strict()
        .refine(input => input.body.length > 0 || input.assetIds.length > 0).parse(await boundedJson(request, 32768));
      return json(checked(writeSchema, await deps.rpc("publish_owned_mobile_official_post", {
        p_app_user_id, p_slug: slug, p_body: value.body, p_asset_ids: value.assetIds, p_idempotency_key: value.idempotencyKey,
      })), 201, headers);
    }),
    clipStatus: (request: Request, slug: string, requestId: string) => run(async () => {
      celebritySlugSchema.parse(slug); z.uuid().parse(requestId);
      const result = await deps.rpc(request.method === "POST" ? "recover_owned_mobile_clip_stamp" : "read_owned_mobile_clip_result", { p_app_user_id: await owner(request), p_slug: slug, p_idempotency_key: requestId });
      return json({ result: result === null ? null : await rewardResult(request, checked(clipWriteResultSchema, result)) }, 200, headers);
    }),
    clips: (request: Request, slug: string) => run(async () => {
      celebritySlugSchema.parse(slug);
      if (request.method === "GET") {
        const raw = await deps.rpc("read_mobile_content_fan_clips", { p_app_user_id: await owner(request, true), p_slug: slug, ...params(request) });
        if (raw === null) throw new Error("FAN_WEB_NOT_FOUND");
        return json(slug === "kyaa-wave-fanpage" ? page(waveAlbumSchema, raw) : page(fanClipSchema, raw), 200, headers);
      }
      const value = createFanClipSchema.parse(await boundedJson(request, 32_768));
      const result = checked(clipWriteResultSchema, await deps.rpc("create_mobile_content_fan_clip", {
        p_app_user_id: await owner(request), p_slug: slug, p_body: value.body, p_visibility: value.visibility,
        p_asset_ids: value.assetIds, p_idempotency_key: value.idempotencyKey,
      }));
      return json(await rewardResult(request,result), 201, headers);
    }),
    clip: (request: Request, id: string) => run(async () => {
      z.uuid().parse(id);
      if (request.method === "DELETE") {
        await deps.rpc("remove_mobile_content_fan_clip", { p_app_user_id: await owner(request), p_clip_id: id });
        return json({ removed: true }, 200, headers);
      }
      const raw = await deps.rpc("read_mobile_content_fan_clip", { p_app_user_id: await owner(request, true), p_clip_id: id, p_locale: locale(request) });
      if (raw === null) throw new Error("FAN_WEB_NOT_FOUND");
      return json({ clip: (typeof raw === "object" && raw !== null && "celebritySlug" in raw && raw.celebritySlug === "kyaa-wave-fanpage" ? checked(waveAlbumSchema, raw) : checked(fanClipSchema, raw)) }, 200, headers);
    }),
    clipLike: (request: Request, id: string) => run(async () => {
      const value = z.object({ liked: z.boolean() }).strict().parse(await boundedJson(request, 1024));
      await deps.rpc("set_mobile_content_fan_clip_like", { p_app_user_id: await owner(request), p_clip_id: z.uuid().parse(id), p_liked: value.liked });
      return json(value, 200, headers);
    }),
    clipComments: (request: Request, id: string) => run(async () => {
      z.uuid().parse(id);
      if (request.method === "GET") {
        const raw = await deps.rpc("read_mobile_content_clip_comments", { p_app_user_id: await owner(request, true), p_clip_id: id, ...params(request) });
        if (raw === null) throw new Error("FAN_WEB_NOT_FOUND");
        return json(page(fanClipCommentSchema, raw), 200, headers);
      }
      const value = createClipCommentSchema.parse(await boundedJson(request, 8192));
      return json(checked(writeSchema, await deps.rpc("post_mobile_content_clip_comment", {
        p_app_user_id: await owner(request), p_clip_id: id, p_parent_id: value.parentId, p_body: value.body, p_idempotency_key: value.idempotencyKey,
      })), 201, headers);
    }),
    removeClipComment: (request: Request, id: string) => run(async () => {
      await deps.rpc("remove_mobile_content_clip_comment", { p_app_user_id: await owner(request), p_comment_id: z.uuid().parse(id) });
      return json({ removed: true }, 200, headers);
    }),
    commentReaction: (request: Request, targetType: "fan_post_comment" | "fan_clip_comment", id: string) => run(async () => {
      const value = z.object({ emoji: reactionEmojiSchema.nullable() }).strict().parse(await boundedJson(request, 1024));
      return json(checked(commentReactionResultSchema, await deps.rpc("set_mobile_content_comment_reaction", {
        p_app_user_id: await owner(request), p_target_type: targetType, p_target_id: z.uuid().parse(id), p_emoji: value.emoji,
      })), 200, headers);
    }),
  };
}
