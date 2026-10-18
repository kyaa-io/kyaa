import { z } from "zod";
import { AuthError } from "@/features/auth/domain/auth-errors";
import { adminCorrelationId } from "@/server/g5/blockchain-job-route";

const uuid = z.uuid();
const input = z.object({
  threshold: z.number().int().positive(),
  postId: uuid,
  effectiveAt: z.iso.datetime({ offset: true }),
  reason: z.string().trim().min(10).max(500),
}).strict();

export type InvitationContentAdminDependencies = {
  authorize(input: { authorization: string; correlationId: string }): Promise<{
    appUserId: string; allowlistId: string; role: "admin" | "operator" | "viewer";
  }>;
  rpc(name: string, args: Record<string, unknown>): Promise<unknown>;
};

const headers = { "cache-control": "private, no-store", vary: "Authorization" } as const;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
function failure(error: unknown) {
  if (error instanceof AuthError) return json({ error: { code: error.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN" } }, error.status);
  if (error instanceof z.ZodError || error instanceof SyntaxError) return json({ error: { code: "INVALID_REQUEST" } }, 400);
  const message = error instanceof Error ? error.message : "";
  if (message.includes("FORBIDDEN")) return json({ error: { code: "FORBIDDEN" } }, 403);
  if (message.includes("CONTENT_UNAVAILABLE")) return json({ error: { code: "CONTENT_UNAVAILABLE" } }, 409);
  return json({ error: { code: "INVITATION_CONTENT_UNAVAILABLE" } }, 503);
}

export function createInvitationContentAdminHandlers(deps: InvitationContentAdminDependencies) {
  return {
    async read(request: Request) {
      try {
        const correlationId = adminCorrelationId(request);
        const actor = await deps.authorize({ authorization: request.headers.get("authorization") ?? "", correlationId });
        return json(await deps.rpc("read_admin_community_stamp_invitation_content", {
          p_actor_app_user_id: actor.appUserId,
          p_actor_admin_allowlist_id: actor.allowlistId,
        }));
      } catch (error) { return failure(error); }
    },
    async create(request: Request) {
      try {
        const correlationId = adminCorrelationId(request);
        const actor = await deps.authorize({ authorization: request.headers.get("authorization") ?? "", correlationId });
        if (actor.role === "viewer") return json({ error: { code: "FORBIDDEN" } }, 403);
        const value = input.parse(await request.json());
        return json(await deps.rpc("create_admin_community_stamp_invitation_content", {
          p_actor_app_user_id: actor.appUserId,
          p_actor_admin_allowlist_id: actor.allowlistId,
          p_threshold: value.threshold,
          p_fan_post_id: value.postId,
          p_effective_at: value.effectiveAt,
          p_reason: value.reason,
          p_correlation_id: correlationId,
        }), 201);
      } catch (error) { return failure(error); }
    },
  };
}
