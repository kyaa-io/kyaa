import "server-only";
import { z } from "zod";
import { WAVE_FANPAGE_SLUG, waveProgramKeySchema, waveProgramStampsSchema, type WaveProgramKey } from "@/features/fanpage/domain/wave-programs";
import { createPostSchema, postSchema } from "@/features/fan-posts/domain/content";
import { boundedJson, json } from "@/server/certification/certification-http";
import { contentFailure } from "@/server/fan-posts/routes";
import type { FanpageDependencies } from "./routes";

const cursorSchema = z.object({ program: waveProgramKeySchema, at: z.iso.datetime({ offset: true }), id: z.uuid() }).strict();
const pageSchema = z.object({ items: z.array(postSchema).max(50), hasMore: z.boolean() }).strict();
const writeSchema = z.object({ id: z.uuid(), revision: z.number().int().positive(), replayed: z.boolean() }).strict();
function checked<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new Error("FAN_WEB_UNAVAILABLE");
  return result.data;
}
function single(url: URL, key: string) {
  const values = url.searchParams.getAll(key);
  if (values.length > 1) throw new Error("FAN_WEB_INVALID_INPUT");
  return values[0];
}
function waveSlug(slug: string) {
  if (slug !== WAVE_FANPAGE_SLUG) throw new Error("FAN_WEB_NOT_FOUND");
}
function programKey(key: string): WaveProgramKey {
  const parsed = waveProgramKeySchema.safeParse(key);
  if (!parsed.success) throw new Error("FAN_WEB_NOT_FOUND");
  return parsed.data;
}
export function createProgramHandlers(deps: Pick<FanpageDependencies, "authorize" | "rpc">) {
  return {
    async posts(request: Request, slug: string, key: string) {
      try {
        waveSlug(slug);
        const program = programKey(key);
        const p_app_user_id = request.method === "GET" && !request.headers.has("authorization") ? null : (await deps.authorize(request.headers.get("authorization"))).appUserId;
        if (request.method === "GET") {
          const url = new URL(request.url), encoded = single(url, "cursor");
          const cursor = encoded === undefined ? null : cursorSchema.parse(JSON.parse(Buffer.from(z.string().min(1).max(400).parse(encoded), "base64url").toString("utf8")));
          if (cursor && cursor.program !== program) throw new Error("FAN_WEB_INVALID_INPUT");
          const p_limit = z.coerce.number().int().min(1).max(50).parse(single(url, "limit") ?? 20);
          const p_locale = z.enum(["ko", "en"]).parse(single(url, "locale") ?? "ko");
          const raw = await deps.rpc("read_fan_program_posts", { p_app_user_id, p_slug: slug, p_program: program, p_before: cursor?.at ?? null, p_before_id: cursor?.id ?? null, p_limit, p_locale });
          if (raw === null) throw new Error("FAN_WEB_NOT_FOUND");
          const data = checked(pageSchema, raw), last = data.items.at(-1);
          if (data.items.some(post => post.celebritySlug !== slug || post.visibility !== "public")) throw new Error("FAN_WEB_UNAVAILABLE");
          return json({ items: data.items, nextCursor: data.hasMore && last ? Buffer.from(JSON.stringify({ program, at: last.createdAt, id: last.id })).toString("base64url") : null });
        }
        const value = createPostSchema.parse(await boundedJson(request, 32_768));
        if (value.visibility !== "public") throw new Error("FAN_WEB_INVALID_INPUT");
        const result = await deps.rpc("save_fan_program_post", { p_app_user_id, p_slug: slug, p_program: program, p_body: value.body, p_visibility: value.visibility, p_asset_ids: value.assetIds, p_idempotency_key: value.idempotencyKey });
        return json(checked(writeSchema, result), 201);
      } catch (error) { return contentFailure(error); }
    },
    async stamps(request: Request, slug: string) {
      try {
        waveSlug(slug);
        const { appUserId } = await deps.authorize(request.headers.get("authorization"));
        const result = await deps.rpc("read_owned_fan_program_stamps", { p_app_user_id: appUserId, p_slug: slug });
        return json(checked(waveProgramStampsSchema, result));
      } catch (error) { return contentFailure(error); }
    },
  };
}
