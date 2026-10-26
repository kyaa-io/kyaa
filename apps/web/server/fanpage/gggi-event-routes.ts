import "server-only";
import { z } from "zod";
import { gggiEventSchema } from "../../features/fanpage/domain/gggi-event";
import { fanpageFailure, fanpageJson, type FanpageDependencies } from "./routes";

const entriesSchema = z.object({
  total: z.number().int().nonnegative(),
  entries: z.array(z.object({ appUserId: z.uuid(), enteredAt: z.iso.datetime({ offset: true }) }).strict()).max(100),
  nextOffset: z.number().int().nonnegative().nullable(),
}).strict();
function result<T>(schema: z.ZodType<T>, raw: unknown) {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new Error("FANPAGE_INVALID_RESPONSE");
  return parsed.data;
}
function failure(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  const status = ({ GGGI_EVENT_LIKE_REQUIRED: 409, GGGI_EVENT_CLOSED: 409, GGGI_EVENT_NOT_FOUND: 404 } as Record<string, number>)[code];
  return status ? fanpageJson({ error: { code } }, status) : fanpageFailure(error);
}
async function requireEmptyBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      if (value.byteLength > 0) {
        await reader.cancel();
        throw new Error("FANPAGE_INVALID_REQUEST");
      }
    }
  } finally { reader.releaseLock(); }
}
export function createGggiEventHandlers(dependencies: FanpageDependencies) {
  return {
    async event(request: Request, slug: string) {
      try {
        if (slug !== "gggi") throw new Error("GGGI_EVENT_NOT_FOUND");
        if (new URL(request.url).search) throw new Error("FANPAGE_INVALID_REQUEST");
        if (request.method === "POST") await requireEmptyBody(request);
        const authorization = request.headers.get("authorization");
        const owner = request.method === "POST" || authorization !== null ? (await dependencies.authorize(authorization)).appUserId : null;
        const raw = await dependencies.rpc(request.method === "POST" ? "enter_gggi_event" : "read_gggi_event", { p_app_user_id: owner });
        const body = result(gggiEventSchema, raw);
        if ((owner === null && body.participation !== null) || (owner !== null && body.participation === null)
          || (request.method === "POST" && !body.participation?.enteredAt)) throw new Error("FANPAGE_INVALID_RESPONSE");
        return fanpageJson(body);
      } catch (error) { return failure(error); }
    },
    async admin(request: Request) {
      try {
        const admin = await dependencies.authorizeAdmin(request.headers.get("authorization"), crypto.randomUUID());
        const params = new URL(request.url).searchParams;
        if ([...params.keys()].some(key => !["offset", "limit"].includes(key) || params.getAll(key).length !== 1)) throw new Error("FANPAGE_INVALID_REQUEST");
        const offset = z.coerce.number().int().min(0).max(1000000).parse(params.get("offset") ?? 0);
        const limit = z.coerce.number().int().min(1).max(100).parse(params.get("limit") ?? 20);
        return fanpageJson(result(entriesSchema, await dependencies.rpc("read_admin_gggi_event_entries", {
          p_actor_app_user_id: admin.appUserId, p_actor_admin_allowlist_id: admin.allowlistId, p_offset: offset, p_limit: limit,
        })));
      } catch (error) { return failure(error); }
    },
  };
}
