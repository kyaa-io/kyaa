import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AuthError } from "@/features/auth/domain/auth-errors";
import { runmusicActionSchema, runmusicCampaignSchema, runmusicSettingsSchema, runmusicStatusSchema } from "@/features/runmusic/domain";
import { boundedJson, CertificationBodyError } from "@/server/certification/certification-http";
import type { FanpageDependencies } from "@/server/fanpage/routes";

const headers = { "cache-control": "private, no-store", vary: "Authorization" };
const json = (value: unknown, status = 200) => Response.json(value, { status, headers });
export function runmusicFailure(error: unknown) {
  if (error instanceof AuthError) return json({ error: { code: "AUTHENTICATION_REQUIRED" } }, error.status);
  if (error instanceof z.ZodError || error instanceof SyntaxError) return json({ error: { code: "RUNMUSIC_INVALID_REQUEST" } }, 400);
  if (error instanceof CertificationBodyError) return json({ error: { code: error.code } }, 413);
  const code = error instanceof Error ? error.message : "";
  const statuses: Record<string, number> = { RUNMUSIC_NOT_FOUND: 404, RUNMUSIC_INVALID_REQUEST: 400, RUNMUSIC_INVALID_SOURCE: 400, RUNMUSIC_CLOSED: 409, RUNMUSIC_DRAW_FROZEN: 409, RUNMUSIC_CONFLICT: 409, RUNMUSIC_CHECKIN_REQUIRED: 409, RUNMUSIC_RATE_LIMITED: 429, RUNMUSIC_INVALID_CODE: 400, RUNMUSIC_WRONG_ANSWER: 400, FAN_WEB_ACTIVE_ACCOUNT_REQUIRED: 403, FAN_WEB_FORBIDDEN: 403, CONTENT_REJECTED: 400, FANPAGE_RATE_LIMITED: 429, FAN_WEB_RATE_LIMITED: 429, MEDIA_INVALID_ASSET: 400, FANPAGE_INVALID_REQUEST: 400, FAN_WEB_INVALID_INPUT: 400 };
  return json({ error: { code: statuses[code] ? code : "RUNMUSIC_UNAVAILABLE" } }, statuses[code] ?? 503);
}
const adminSchema = z.object({ campaign: runmusicCampaignSchema, revision: z.number().int().positive(), participantCount: z.number().int().nonnegative(), drawId: z.uuid().nullable(), winnerCount: z.number().int().nonnegative(), receivedCount: z.number().int().nonnegative() }).strict();
function checked<T>(schema: z.ZodType<T>, raw: unknown) { const parsed = schema.safeParse(raw); if (!parsed.success) throw new Error("RUNMUSIC_UNAVAILABLE"); return parsed.data; }
export function createRunmusicHandlers(deps: FanpageDependencies) {
  const run = async (fn: () => Promise<Response>) => { try { return await fn(); } catch (e) { return runmusicFailure(e); } };
  return {
    campaign: () => run(async () => json(checked(runmusicCampaignSchema, await deps.rpc("read_runmusic_campaign", {})))),
    me: (request: Request) => run(async () => {
      const { appUserId } = await deps.authorize(request.headers.get("authorization"));
      const input = request.method === "POST" ? runmusicActionSchema.parse(await boundedJson(request, 8192)) : null;
      const raw = await deps.rpc(input ? "submit_owned_runmusic" : "read_owned_runmusic", { p_app_user_id: appUserId, ...(input ? { p_input: input } : {}) });
      const failure = z.object({ error: z.object({ code: z.enum(["RUNMUSIC_RATE_LIMITED", "RUNMUSIC_INVALID_CODE", "RUNMUSIC_WRONG_ANSWER"]) }).strict() }).strict().safeParse(raw);
      if (failure.success) return json(failure.data, failure.data.error.code === "RUNMUSIC_RATE_LIMITED" ? 429 : 400);
      return json(checked(runmusicStatusSchema, raw));
    }),
    admin: (request: Request, action = "read") => run(async () => {
      const correlationId = randomUUID(), actor = await deps.authorizeAdmin(request.headers.get("authorization"), correlationId);
      let input: unknown = {};
      if (request.method !== "GET") {
        const schema = action === "settings" ? runmusicSettingsSchema : action === "draw" ? z.object({ requestKey: z.uuid() }).strict() : action === "rotate-code" ? z.object({ code: z.string().min(16).max(128) }).strict() : z.object({ receiptId: z.uuid() }).strict();
        input = schema.parse(await boundedJson(request, 4096));
      }
      const raw = await deps.rpc("admin_runmusic", { p_actor_app_user_id: actor.appUserId, p_actor_admin_allowlist_id: actor.allowlistId, p_correlation_id: correlationId, p_action: action, p_input: input });
      return json(action === "receive" ? checked(z.object({ receivedAt: z.string(), replayed: z.boolean() }).strict(), raw) : checked(adminSchema, raw));
    }),
  };
}
