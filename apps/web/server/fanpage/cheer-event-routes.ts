import "server-only";
import { z } from "zod";
import { cheerEventResponseSchema, cheerEventRewardsResponseSchema, legacyCheerEventResponseSchema, cheerEventParticipantsSchema } from "../../features/fanpage/domain/cheer-event";
import { celebritySlugSchema } from "../../features/fanpage/domain/community";
import { fanpageFailure, fanpageJson, type FanpageDependencies } from "./routes";

function param(url: URL, key: string) {
  const values = url.searchParams.getAll(key);
  if (values.length > 1) throw new Error("FANPAGE_INVALID_REQUEST");
  return values[0];
}
function result<T>(schema: z.ZodType<T>, raw: unknown) {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new Error("FANPAGE_INVALID_RESPONSE");
  return parsed.data;
}
export function createCheerEventHandlers(dependencies: FanpageDependencies) {
  return {
    async event(request: Request, slug: string) {
      try {
        celebritySlugSchema.parse(slug);
        const url = new URL(request.url);
        const locale = z.enum(["ko", "en"]).parse(param(url, "locale") ?? "ko");
        const liveState = z.literal("1").optional().parse(param(url, "liveState"));
        const rewards = z.literal("1").optional().parse(param(url, "rewards"));
        const authorization = request.headers.get("authorization");
        const owner = authorization === null ? null : (await dependencies.authorize(authorization)).appUserId;
        const raw = await dependencies.rpc(rewards ? "read_celebrity_cheer_event_rewards" : liveState ? "read_celebrity_cheer_event_live_state" : "read_celebrity_cheer_event", {
          p_slug: slug, p_app_user_id: owner, p_locale: locale,
        });
        return fanpageJson(rewards ? result(cheerEventRewardsResponseSchema, raw) : liveState ? result(cheerEventResponseSchema, raw) : result(legacyCheerEventResponseSchema, raw));
      } catch (error) { return fanpageFailure(error); }
    },
    async participants(request: Request, id: string) {
      try {
        z.uuid().parse(id);
        const admin = await dependencies.authorizeAdmin(request.headers.get("authorization"), crypto.randomUUID());
        const url = new URL(request.url);
        const offset = z.coerce.number().int().min(0).max(1000000).parse(param(url, "offset") ?? 0);
        const limit = z.coerce.number().int().min(1).max(100).parse(param(url, "limit") ?? 20);
        return fanpageJson(result(cheerEventParticipantsSchema, await dependencies.rpc("read_admin_cheer_event_participants", {
          p_actor_app_user_id: admin.appUserId, p_actor_admin_allowlist_id: admin.allowlistId,
          p_campaign_id: id, p_offset: offset, p_limit: limit,
        })));
      } catch (error) { return fanpageFailure(error); }
    },
  };
}
