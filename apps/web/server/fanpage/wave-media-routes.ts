import "server-only";
import { z } from "zod";
import { boundedJson, json } from "@/server/certification/certification-http";
import { contentFailure } from "@/server/fan-posts/routes";
import { createWaveAlbumSchema, waveAlbumSchema, waveAlbumWriteSchema } from "@/features/fanpage/domain/wave-media";
import type { FanpageDependencies } from "./routes";

const cursorSchema = z.object({ at: z.iso.datetime({ offset: true }), id: z.uuid() }).strict();
const headers = { "cache-control": "private, no-store", vary: "Authorization" };
function checked<T>(schema: z.ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) throw new Error("FAN_WEB_UNAVAILABLE");
  return result.data;
}
export function createWaveMediaHandlers(deps: Pick<FanpageDependencies, "authorize" | "rpc">) {
  return {
    async albums(request: Request, profileId?: string) {
      try {
        const { appUserId } = await deps.authorize(request.headers.get("authorization"));
        if (profileId) z.uuid().parse(profileId);
        if (request.method === "POST") {
          const value = createWaveAlbumSchema.parse(await boundedJson(request, 16_384));
          return json(checked(waveAlbumWriteSchema, await deps.rpc("create_kyaa_wave_album", {
            p_app_user_id: appUserId, p_slug: "kyaa-wave-fanpage", p_body: value.body, p_visibility: "public", p_asset_ids: value.assetIds, p_idempotency_key: value.idempotencyKey,
          })), 201, headers);
        }
        const url = new URL(request.url);
        if ([...url.searchParams.keys()].some(key => !["cursor", "limit", "locale"].includes(key) || url.searchParams.getAll(key).length !== 1)) throw new SyntaxError("invalid query");
        let cursor: z.infer<typeof cursorSchema> | null = null;
        if (url.searchParams.has("cursor")) {
          try { cursor = cursorSchema.parse(JSON.parse(Buffer.from(z.string().min(1).max(240).parse(url.searchParams.get("cursor")), "base64url").toString("utf8"))); }
          catch { throw new SyntaxError("invalid cursor"); }
        }
        const result = checked(z.object({ items: z.array(waveAlbumSchema).max(50), hasMore: z.boolean() }).strict(), await deps.rpc("read_kyaa_wave_albums", {
          p_app_user_id: appUserId, p_profile_id: profileId ?? null, p_before: cursor?.at ?? null, p_before_id: cursor?.id ?? null,
          p_limit: z.coerce.number().int().min(1).max(50).parse(url.searchParams.get("limit") ?? 20), p_locale: z.enum(["ko", "en"]).parse(url.searchParams.get("locale") ?? "ko"),
        }));
        const last = result.items.at(-1);
        return json({ items: result.items, nextCursor: result.hasMore && last ? Buffer.from(JSON.stringify({ at: last.createdAt, id: last.id })).toString("base64url") : null }, 200, headers);
      } catch (error) { return contentFailure(error); }
    },
    async album(request: Request, id: string) {
      try {
        const { appUserId } = await deps.authorize(request.headers.get("authorization"));
        z.uuid().parse(id);
        const raw = await deps.rpc("kyaa_wave_album_json", { p_app_user_id: appUserId, p_clip_id: id, p_locale: "ko" });
        if (raw === null) throw new Error("FAN_WEB_NOT_FOUND");
        const album = checked(waveAlbumSchema, raw);
        if (album.celebritySlug !== "kyaa-wave-fanpage") throw new Error("FAN_WEB_NOT_FOUND");
        return json({ album }, 200, headers);
      } catch (error) { return contentFailure(error); }
    },
  };
}
