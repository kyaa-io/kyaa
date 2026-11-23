import "server-only";
import { type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createClient } from "@/server/data/client";
import { AuthError } from "../../features/auth/domain/auth-errors";
import type { AdminSession } from "../admin/admin-session-gate";
import { channelOperatorInvitationListSchema, invitationInputSchema, type ChannelOperatorInvitation } from "../../features/operator/domain/channel-operator-grants";

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
const inviteResultSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("granted"), id: z.uuid(), status: z.enum(["active", "revoked"]), replayed: z.boolean() }),
  z.object({ kind: z.literal("invited"), id: z.uuid(), status: z.literal("pending"), expiresAt: z.iso.datetime({ offset: true }), replayed: z.boolean() }),
]);
const cancelResultSchema = z.object({ id: z.uuid(), status: z.enum(["pending", "accepted", "cancelled", "expired"]), replayed: z.boolean() });
export type ChannelOperatorInviteResult = z.infer<typeof inviteResultSchema>;

const errorMessages = {
  "full admin required": "CHANNEL_OPERATOR_FORBIDDEN",
  "viewer is read-only": "CHANNEL_OPERATOR_FORBIDDEN",
  "active admin required": "CHANNEL_OPERATOR_FORBIDDEN",
  "channel not found": "CHANNEL_OPERATOR_NOT_FOUND",
  "operator candidate not found": "CHANNEL_OPERATOR_CANDIDATE_NOT_FOUND",
  "operator candidate ambiguous": "CHANNEL_OPERATOR_CANDIDATE_AMBIGUOUS",
  "channel operator grant not found": "CHANNEL_OPERATOR_NOT_FOUND",
  "operator invitation not found": "CHANNEL_OPERATOR_NOT_FOUND",
  "operator invitation exists": "CHANNEL_OPERATOR_INVITATION_EXISTS",
  "operator invitation not pending": "CHANNEL_OPERATOR_INVITATION_NOT_PENDING",
  "operator invitation rate limited": "CHANNEL_OPERATOR_INVITATION_RATE_LIMITED",
  "operator invitation invalid": "CHANNEL_OPERATOR_INVITATION_INVALID",
} as const;
export type ChannelOperatorGrantErrorCode = typeof errorMessages[keyof typeof errorMessages] | "CHANNEL_OPERATOR_UNAVAILABLE";
export class ChannelOperatorGrantError extends Error {
  constructor(readonly code: ChannelOperatorGrantErrorCode = "CHANNEL_OPERATOR_UNAVAILABLE") { super(code); }
}

export interface ChannelOperatorGrantRepository {
  list(actor: AdminSession, celebrityId: string): Promise<{ items: ChannelOperatorGrant[] }>;
  grant(actor: AdminSession, celebrityId: string, email: string, correlationId: string): Promise<{ id: string; status: "active" | "revoked"; replayed: boolean }>;
  revoke(actor: AdminSession, celebrityId: string, grantId: string, correlationId: string): Promise<{ id: string; status: "active" | "revoked"; replayed: boolean }>;
  listInvitations(actor: AdminSession, celebrityId: string): Promise<{ items: ChannelOperatorInvitation[] }>;
  invite(actor: AdminSession, celebrityId: string, input: { email: string; locale: "ko" | "en"; origin: string }, correlationId: string): Promise<ChannelOperatorInviteResult>;
  cancelInvitation(actor: AdminSession, celebrityId: string, invitationId: string, correlationId: string): Promise<{ id: string; status: string; replayed: boolean }>;
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
    async listInvitations(actor, celebrityId) {
      const parsed = channelOperatorInvitationListSchema.safeParse(await call("list_channel_operator_invitations", { ...actorArgs(actor), p_celebrity_id: celebrityId }));
      if (!parsed.success) throw new ChannelOperatorGrantError();
      return parsed.data;
    },
    async invite(actor, celebrityId, input, correlationId) {
      const parsed = inviteResultSchema.safeParse(await call("invite_channel_operator", {
        ...actorArgs(actor), p_correlation_id: correlationId, p_celebrity_id: celebrityId,
        p_target_email: input.email, p_locale: input.locale, p_origin: input.origin,
      }));
      if (!parsed.success) throw new ChannelOperatorGrantError();
      return parsed.data;
    },
    async cancelInvitation(actor, celebrityId, invitationId, correlationId) {
      const parsed = cancelResultSchema.safeParse(await call("cancel_channel_operator_invitation", { ...actorArgs(actor), p_correlation_id: correlationId, p_celebrity_id: celebrityId, p_invitation_id: invitationId }));
      if (!parsed.success) throw new ChannelOperatorGrantError();
      return parsed.data;
    },
  };
}

const headers = { "cache-control": "private, no-store", vary: "Authorization" };
const errorResponse = (code: string, status: number) => Response.json({ error: { code } }, { status, headers });
const statusOf = (code: ChannelOperatorGrantErrorCode) => code === "CHANNEL_OPERATOR_FORBIDDEN" ? 403
  : code === "CHANNEL_OPERATOR_NOT_FOUND" || code === "CHANNEL_OPERATOR_CANDIDATE_NOT_FOUND" ? 404
  : code === "CHANNEL_OPERATOR_CANDIDATE_AMBIGUOUS" || code === "CHANNEL_OPERATOR_INVITATION_EXISTS" || code === "CHANNEL_OPERATOR_INVITATION_NOT_PENDING" ? 409
  : code === "CHANNEL_OPERATOR_INVITATION_RATE_LIMITED" ? 429
  : code === "CHANNEL_OPERATOR_INVITATION_INVALID" ? 400 : 503;
const publicCode = (code: ChannelOperatorGrantErrorCode) => code === "CHANNEL_OPERATOR_FORBIDDEN" ? "FORBIDDEN" : code === "CHANNEL_OPERATOR_INVITATION_INVALID" ? "INVALID_INPUT" : code;

async function readJsonBody(request: Request): Promise<{ ok: true; body: unknown } | { ok: false }> {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return { ok: false };
  try {
    const raw = await request.text();
    if (raw.length > 4096) return { ok: false };
    return { ok: true, body: JSON.parse(raw) };
  } catch { return { ok: false }; }
}

/**
 * Grant, revoke and list channel operators, and invite, cancel and list email
 * invitations. Only a full admin may call any method.
 */
export function createChannelOperatorGrantHandlers(dependencies: {
  authorize(input: { authorization: string; correlationId: string }): Promise<AdminSession>;
  repository: ChannelOperatorGrantRepository;
  origin?: string;
}) {
  async function run(request: Request, celebrityId: string, childId: string | null, action: (actor: AdminSession, correlationId: string) => Promise<Response>): Promise<Response> {
    const correlationId = crypto.randomUUID();
    try {
      if (!z.uuid().safeParse(celebrityId).success || (childId !== null && !z.uuid().safeParse(childId).success)) return errorResponse("INVALID_INPUT", 400);
      const actor = await dependencies.authorize({ authorization: request.headers.get("authorization") ?? "", correlationId });
      if (actor.role !== "admin") return errorResponse("FORBIDDEN", 403);
      if (new URL(request.url).search) return errorResponse("INVALID_INPUT", 400);
      return await action(actor, correlationId);
    } catch (error) {
      if (error instanceof AuthError) return errorResponse(error.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN", error.status === 401 ? 401 : 403);
      if (error instanceof ChannelOperatorGrantError) return errorResponse(publicCode(error.code), statusOf(error.code));
      return errorResponse("CHANNEL_OPERATOR_UNAVAILABLE", 503);
    }
  }

  function handle(request: Request, celebrityId: string, grantId: string | null): Promise<Response> {
    return run(request, celebrityId, grantId, async (actor, correlationId) => {
      if (request.method === "GET" && grantId === null) return Response.json(await dependencies.repository.list(actor, celebrityId), { headers });
      if (request.method === "DELETE" && grantId !== null) return Response.json({ item: await dependencies.repository.revoke(actor, celebrityId, grantId, correlationId) }, { headers });
      if (request.method !== "POST" || grantId !== null) return errorResponse("METHOD_NOT_ALLOWED", 405);
      const read = await readJsonBody(request);
      const parsed = read.ok ? grantInputSchema.safeParse(read.body) : null;
      if (!parsed?.success) return errorResponse("INVALID_INPUT", 400);
      const item = await dependencies.repository.grant(actor, celebrityId, parsed.data.email, correlationId);
      return Response.json({ item }, { status: item.replayed ? 200 : 201, headers });
    });
  }

  function handleInvitation(request: Request, celebrityId: string, invitationId: string | null): Promise<Response> {
    return run(request, celebrityId, invitationId, async (actor, correlationId) => {
      if (request.method === "GET" && invitationId === null) return Response.json(await dependencies.repository.listInvitations(actor, celebrityId), { headers });
      if (request.method === "DELETE" && invitationId !== null) return Response.json({ item: await dependencies.repository.cancelInvitation(actor, celebrityId, invitationId, correlationId) }, { headers });
      if (request.method !== "POST" || invitationId !== null) return errorResponse("METHOD_NOT_ALLOWED", 405);
      if (!dependencies.origin) return errorResponse("CHANNEL_OPERATOR_UNAVAILABLE", 503);
      const read = await readJsonBody(request);
      const parsed = read.ok ? invitationInputSchema.safeParse(read.body) : null;
      if (!parsed?.success) return errorResponse("INVALID_INPUT", 400);
      const item = await dependencies.repository.invite(actor, celebrityId, { ...parsed.data, origin: dependencies.origin }, correlationId);
      return Response.json({ item }, { status: item.replayed ? 200 : 201, headers });
    });
  }
  return { handle, handleInvitation };
}
