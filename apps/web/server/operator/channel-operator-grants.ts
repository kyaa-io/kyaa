import "server-only";
import { type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createClient } from "@/server/data/client";
import { AuthError } from "../../features/auth/domain/auth-errors";
import type { AdminSession } from "../admin/admin-session-gate";

export const channelOperatorGrantSchema = z.object({
  id: z.uuid(),
  appUserId: z.uuid(),
  email: z.string(),
  status: z.enum(["active", "revoked"]),
  grantedAt: z.iso.datetime({ offset: true }),
  revokedAt: z.iso.datetime({ offset: true }).nullable(),
});
export const channelOperatorListSchema = z.object({ items: z.array(channelOperatorGrantSchema) });
const grantResultSchema = z.object({ id: z.uuid(), status: z.enum(["active", "revoked"]), replayed: z.boolean() }).passthrough();
export const grantInputSchema = z.object({ email: z.string().trim().toLowerCase().max(254).email() }).strict();

export type ChannelOperatorGrant = z.infer<typeof channelOperatorGrantSchema>;

const errorMessages = {
  "full admin required": "CHANNEL_OPERATOR_FORBIDDEN",
  "viewer is read-only": "CHANNEL_OPERATOR_FORBIDDEN",
  "active admin required": "CHANNEL_OPERATOR_FORBIDDEN",
  "channel not found": "CHANNEL_OPERATOR_NOT_FOUND",
  "operator candidate not found": "CHANNEL_OPERATOR_CANDIDATE_NOT_FOUND",
  "operator candidate ambiguous": "CHANNEL_OPERATOR_CANDIDATE_AMBIGUOUS",
  "channel operator grant not found": "CHANNEL_OPERATOR_NOT_FOUND",
} as const;
export type ChannelOperatorGrantErrorCode = typeof errorMessages[keyof typeof errorMessages] | "CHANNEL_OPERATOR_UNAVAILABLE";
export class ChannelOperatorGrantError extends Error {
  constructor(readonly code: ChannelOperatorGrantErrorCode = "CHANNEL_OPERATOR_UNAVAILABLE") { super(code); }
}

export interface ChannelOperatorGrantRepository {
  list(actor: AdminSession, celebrityId: string): Promise<{ items: ChannelOperatorGrant[] }>;
  grant(actor: AdminSession, celebrityId: string, email: string, correlationId: string): Promise<{ id: string; status: "active" | "revoked"; replayed: boolean }>;
  revoke(actor: AdminSession, celebrityId: string, grantId: string, correlationId: string): Promise<{ id: string; status: "active" | "revoked"; replayed: boolean }>;
}

export function createChannelOperatorGrantRepository(
  config: { url: string | undefined; serviceRoleKey: string | undefined }, client?: Pick<SupabaseClient, "rpc">,
): ChannelOperatorGrantRepository {
  const db = client ?? createClient(config.url, config.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const actorArgs = (actor: AdminSession) => ({ p_actor_app_user_id: actor.appUserId, p_actor_admin_allowlist_id: actor.allowlistId });
  async function call(name: string, args: Record<string, unknown>) {
    const { data, error } = await db.rpc(name, args);
    if (error) {
      // Match only known application messages; never relay SQL details or emails.
      const known = (Object.keys(errorMessages) as (keyof typeof errorMessages)[]).find((message) => message === error.message);
      throw new ChannelOperatorGrantError(known ? errorMessages[known] : undefined);
    }
    return data;
  }
  const result = (data: unknown) => {
    const parsed = grantResultSchema.safeParse(data);
    if (!parsed.success) throw new ChannelOperatorGrantError();
    return { id: parsed.data.id, status: parsed.data.status, replayed: parsed.data.replayed };
  };
  return {
    async list(actor, celebrityId) {
      const parsed = channelOperatorListSchema.safeParse(await call("list_channel_operators", { ...actorArgs(actor), p_celebrity_id: celebrityId }));
      if (!parsed.success) throw new ChannelOperatorGrantError();
      return parsed.data;
    },
    async grant(actor, celebrityId, email, correlationId) {
      return result(await call("grant_channel_operator", { ...actorArgs(actor), p_correlation_id: correlationId, p_celebrity_id: celebrityId, p_target_email: email }));
    },
    async revoke(actor, celebrityId, grantId, correlationId) {
      return result(await call("revoke_channel_operator", { ...actorArgs(actor), p_correlation_id: correlationId, p_celebrity_id: celebrityId, p_grant_id: grantId }));
    },
  };
}

const headers = { "cache-control": "private, no-store", vary: "Authorization" };
const errorResponse = (code: string, status: number) => Response.json({ error: { code } }, { status, headers });
const statusOf = (code: ChannelOperatorGrantErrorCode) => code === "CHANNEL_OPERATOR_FORBIDDEN" ? 403
  : code === "CHANNEL_OPERATOR_NOT_FOUND" || code === "CHANNEL_OPERATOR_CANDIDATE_NOT_FOUND" ? 404
  : code === "CHANNEL_OPERATOR_CANDIDATE_AMBIGUOUS" ? 409 : 503;

/** Grant, revoke and list channel operators. Only a full admin may call any method. */
export function createChannelOperatorGrantHandlers(dependencies: {
  authorize(input: { authorization: string; correlationId: string }): Promise<AdminSession>;
  repository: ChannelOperatorGrantRepository;
}) {
  async function handle(request: Request, celebrityId: string, grantId: string | null): Promise<Response> {
    const correlationId = crypto.randomUUID();
    try {
      if (!z.uuid().safeParse(celebrityId).success || (grantId !== null && !z.uuid().safeParse(grantId).success)) return errorResponse("INVALID_INPUT", 400);
      const actor = await dependencies.authorize({ authorization: request.headers.get("authorization") ?? "", correlationId });
      if (actor.role !== "admin") return errorResponse("FORBIDDEN", 403);
      if (new URL(request.url).search) return errorResponse("INVALID_INPUT", 400);
      if (request.method === "GET" && grantId === null) return Response.json(await dependencies.repository.list(actor, celebrityId), { headers });
      if (request.method === "DELETE" && grantId !== null) return Response.json({ item: await dependencies.repository.revoke(actor, celebrityId, grantId, correlationId) }, { headers });
      if (request.method !== "POST" || grantId !== null) return errorResponse("METHOD_NOT_ALLOWED", 405);
      if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return errorResponse("INVALID_INPUT", 400);
      let body: unknown;
      try {
        const raw = await request.text();
        if (raw.length > 4096) return errorResponse("INVALID_INPUT", 400);
        body = JSON.parse(raw);
      } catch { return errorResponse("INVALID_INPUT", 400); }
      const parsed = grantInputSchema.safeParse(body);
      if (!parsed.success) return errorResponse("INVALID_INPUT", 400);
      const item = await dependencies.repository.grant(actor, celebrityId, parsed.data.email, correlationId);
      return Response.json({ item }, { status: item.replayed ? 200 : 201, headers });
    } catch (error) {
      if (error instanceof AuthError) return errorResponse(error.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN", error.status === 401 ? 401 : 403);
      if (error instanceof ChannelOperatorGrantError) return errorResponse(error.code === "CHANNEL_OPERATOR_FORBIDDEN" ? "FORBIDDEN" : error.code, statusOf(error.code));
      return errorResponse("CHANNEL_OPERATOR_UNAVAILABLE", 503);
    }
  }
  return { handle };
}
