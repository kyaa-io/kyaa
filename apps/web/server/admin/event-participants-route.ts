import "server-only";
import { AuthError } from "../../features/auth/domain/auth-errors";
import { z } from "zod";
import { eventParticipantEvents, eventParticipantPageSize, eventParticipantsSchema, type EventParticipantEvent } from "../../features/admin/event-participants";
import type { FanpageDependencies } from "../fanpage/routes";

const headers = { "cache-control": "private, no-store", vary: "Authorization" };
const failure = (code: string, status: number) => Response.json({ error: { code } }, { status, headers });
const integer = (value: string | null, fallback: number) => (value === null ? fallback : /^\d{1,7}$/.test(value) ? Number(value) : NaN);
const instant = z.iso.datetime({ offset: true });
const optional = (value: string | null, schema: z.ZodType<string>) => (value === null ? { value: null } : schema.safeParse(value).success ? { value } : null);

export function createEventParticipantsHandler(deps: Pick<FanpageDependencies, "authorizeAdmin" | "rpc">) {
  return async (request: Request): Promise<Response> => {
    try {
      const actor = await deps.authorizeAdmin(request.headers.get("authorization"), crypto.randomUUID());
      if (request.method !== "GET") return failure("METHOD_NOT_ALLOWED", 405);
      const params = new URL(request.url).searchParams;
      const event = params.get("event") as EventParticipantEvent | null;
      const limit = integer(params.get("limit"), 100);
      const asOf = optional(params.get("asOf"), instant), afterAt = optional(params.get("afterAt"), instant), afterId = optional(params.get("afterId"), z.uuid());
      if ([...params.keys()].some(key => !["event", "limit", "asOf", "afterAt", "afterId"].includes(key)) || !event
        || !eventParticipantEvents.includes(event) || !(limit >= 1 && limit <= eventParticipantPageSize)
        || !asOf || !afterAt || !afterId || (afterAt.value === null) !== (afterId.value === null) || (afterAt.value !== null && asOf.value === null)) {
        return failure("INVALID_REQUEST", 400);
      }
      const result = eventParticipantsSchema.parse(await deps.rpc("list_admin_event_participants", {
        p_actor_app_user_id: actor.appUserId,
        p_actor_admin_allowlist_id: actor.allowlistId,
        p_event: event, p_as_of: asOf.value, p_after_at: afterAt.value, p_after_id: afterId.value, p_limit: limit,
      }));
      return Response.json(result, { headers });
    } catch (error) {
      if (error instanceof AuthError) return failure(error.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN", error.status === 401 ? 401 : 403);
      if (error instanceof Error && error.message === "EVENT_PARTICIPANTS_FORBIDDEN") return failure("FORBIDDEN", 403);
      return failure("EVENT_PARTICIPANTS_UNAVAILABLE", 503);
    }
  };
}
