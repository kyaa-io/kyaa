import "server-only";
import { z } from "zod";
import { homeNoticeCommentSchema, homeNoticeCommentInputSchema, homeNoticeCommentWriteSchema } from "@/features/home/domain/home-notice-participation";
import { boundedJson } from "@/server/certification/certification-http";
import { contentFailure } from "@/server/fan-posts/routes";
import { fanpageJson, type FanpageDependencies } from "@/server/fanpage/routes";

const videoIdSchema = z.string().regex(/^(?:[A-Za-z0-9_-]{11}|[0-9]{15,25})$/);
const participationSchema = z.object({ reaction: z.enum(["like", "dislike"]).nullable(), likeCount: z.number().int().nonnegative(), dislikeCount: z.number().int().nonnegative(), commentCount: z.number().int().nonnegative() }).strict();
const reactionInputSchema = z.object({ reaction: z.enum(["like", "dislike", "none"]) }).strict();
const cursorSchema = z.object({ at: z.iso.datetime({ offset: true }), id: z.uuid() }).strict();
const pageSchema = z.object({ items: z.array(homeNoticeCommentSchema).max(20), hasMore: z.boolean() }).strict();
function checked<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new Error("FAN_WEB_INVALID_RESPONSE");
  return result.data;
}

export function createShortformParticipationHandlers(deps: Pick<FanpageDependencies, "authorize" | "rpc">) {
  const owner = async (request: Request, optional = false) => optional && !request.headers.has("authorization") ? null : (await deps.authorize(request.headers.get("authorization"))).appUserId;
  const run = async (action: () => Promise<Response>) => { try { return await action(); } catch (error) { return contentFailure(error); } };
  return {
    comments: (request: Request, slug: string) => run(async () => {
      videoIdSchema.parse(slug);
      const appUserId = await owner(request, request.method === "GET");
      if (request.method === "POST") {
        const input = homeNoticeCommentInputSchema.parse(await boundedJson(request, 8192));
        const result = await deps.rpc("post_shortform_comment", { p_video_id: slug, p_app_user_id: appUserId, p_body: input.body, p_idempotency_key: input.idempotencyKey });
        return fanpageJson(checked(homeNoticeCommentWriteSchema, result));
      }
      const query = new URL(request.url).searchParams;
      if (query.getAll("cursor").length > 1 || query.getAll("locale").length > 1) throw new SyntaxError();
      const locale = z.enum(["ko", "en"]).parse(query.get("locale") ?? "ko");
      const value = query.get("cursor");
      const cursor = value ? cursorSchema.parse(JSON.parse(Buffer.from(z.string().max(240).parse(value), "base64url").toString("utf8"))) : null;
      const result = await deps.rpc("read_shortform_comments", { p_video_id: slug, p_app_user_id: appUserId, p_locale: locale, p_before: cursor?.at ?? null, p_before_id: cursor?.id ?? null });
      if (!result) throw new Error("FAN_WEB_NOT_FOUND");
      const page = checked(pageSchema, result), last = page.items.at(-1);
      return fanpageJson({ items: page.items, nextCursor: page.hasMore && last ? Buffer.from(JSON.stringify({ at: last.createdAt, id: last.id })).toString("base64url") : null });
    }),
    reaction: (request: Request, slug: string) => run(async () => {
      videoIdSchema.parse(slug);
      if (request.method === "GET") {
        const result = await deps.rpc("read_shortform_participation", { p_video_id: slug, p_app_user_id: await owner(request, true) });
        if (!result) throw new Error("FAN_WEB_NOT_FOUND");
        return fanpageJson(checked(participationSchema, result));
      }
      const appUserId = await owner(request);
      const { reaction } = reactionInputSchema.parse(await boundedJson(request, 8192));
      const result = await deps.rpc("set_shortform_reaction", { p_video_id: slug, p_app_user_id: appUserId, p_reaction: reaction });
      return fanpageJson(checked(participationSchema, result));
    }),
    removeComment: (request: Request, id: string) => run(async () => {
      z.uuid().parse(id);
      await deps.rpc("remove_shortform_comment", { p_comment_id: id, p_app_user_id: await owner(request) });
      return fanpageJson({ removed: true });
    }),
  };
}
