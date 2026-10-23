import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AuthError } from "@/features/auth/domain/auth-errors";
import { runmusicActionSchema, runmusicCampaignSchema, runmusicSettingsSchema, runmusicStatusSchema, runmusicAdminStateSchema } from "@/features/runmusic/domain";
import { decryptRunmusicContact, encryptRunmusicContact, parseRunmusicContactKey } from "./contact-crypto";
import { boundedJson, CertificationBodyError } from "@/server/certification/certification-http";
import type { FanpageDependencies } from "@/server/fanpage/routes";

const headers = { "cache-control": "private, no-store", vary: "Authorization" };
const json = (value: unknown, status = 200) => Response.json(value, { status, headers });
export function runmusicFailure(error: unknown) {
  if (error instanceof AuthError) return json({ error: { code: "AUTHENTICATION_REQUIRED" } }, error.status);
  if (error instanceof z.ZodError || error instanceof SyntaxError) return json({ error: { code: "RUNMUSIC_INVALID_REQUEST" } }, 400);
  if (error instanceof CertificationBodyError) return json({ error: { code: error.code } }, error.code === "BODY_TOO_LARGE" ? 413 : 400);
  const code = error instanceof Error ? error.message : "";
  const statuses: Record<string, number> = { RUNMUSIC_NOT_FOUND: 404, RUNMUSIC_INVALID_REQUEST: 400, RUNMUSIC_CLOSED: 409, RUNMUSIC_DRAW_FROZEN: 409, RUNMUSIC_CONFLICT: 409, RUNMUSIC_LIKE_REQUIRED: 409, RUNMUSIC_ENTRY_REQUIRED: 409, RUNMUSIC_NOT_DUE: 409, RUNMUSIC_CONTACT_UNAVAILABLE: 503, RUNMUSIC_RATE_LIMITED: 429, FAN_WEB_ACTIVE_ACCOUNT_REQUIRED: 403, FAN_WEB_FORBIDDEN: 403, FANPAGE_RATE_LIMITED: 429, FAN_WEB_RATE_LIMITED: 429, FANPAGE_INVALID_REQUEST: 400, FAN_WEB_INVALID_INPUT: 400 };
  return json({ error: { code: statuses[code] ? code : "RUNMUSIC_UNAVAILABLE" } }, statuses[code] ?? 503);
}
function checked<T>(schema: z.ZodType<T>, raw: unknown) { const parsed = schema.safeParse(raw); if (!parsed.success) throw new Error("RUNMUSIC_UNAVAILABLE"); return parsed.data; }
export function createRunmusicHandlers(deps: FanpageDependencies, getKey = () => parseRunmusicContactKey(process.env.RUNMUSIC_CONTACT_ENCRYPTION_KEY)) {
  const run = async (fn: () => Promise<Response>) => { try { return await fn(); } catch (e) { return runmusicFailure(e); } };
  return {
    campaign: () => run(async () => json(checked(runmusicCampaignSchema, await deps.rpc("read_runmusic_campaign_v2", {})))),
    me: (request: Request) => run(async () => {
      const { appUserId } = await deps.authorize(request.headers.get("authorization"));
      if (request.method !== "GET" && request.method !== "POST") return json({ error: { code: "METHOD_NOT_ALLOWED" } }, 405);
      const input = request.method === "POST" ? runmusicActionSchema.parse(await boundedJson(request, 2048)) : null;
      const command = input?.action === "save_contact"
        ? { action: input.action, requestKey: input.requestKey, ...encryptRunmusicContact(input.kakaoId, appUserId, getKey()) }
        : input;
      const raw = await deps.rpc(input ? "submit_owned_runmusic_v2" : "read_owned_runmusic_v2", { p_app_user_id: appUserId, ...(command ? { p_input: command } : {}) });
      return json(checked(runmusicStatusSchema, raw));
    }),
    admin: (request: Request, action = "read") => run(async () => {
      const correlationId = randomUUID(), actor = await deps.authorizeAdmin(request.headers.get("authorization"), correlationId);
      if (action === "rotate-code") return json({ error: { code: "RUNMUSIC_CLOSED" } }, 409);
      let input: unknown = {};
      if (request.method !== "GET") {
        const schema = action === "settings" ? runmusicSettingsSchema : action === "draw" ? z.object({ requestKey: z.uuid() }).strict() : action === "contact" ? z.object({ appUserId: z.uuid() }).strict() : z.object({ receiptId: z.uuid() }).strict();
        input = schema.parse(await boundedJson(request, 4096));
      }
      const raw = await deps.rpc("admin_runmusic_v2", { p_actor_app_user_id: actor.appUserId, p_actor_admin_allowlist_id: actor.allowlistId, p_correlation_id: correlationId, p_action: action, p_input: input });
      if (action === "contact") {
        const contact = checked(z.object({ appUserId: z.uuid(), ciphertext: z.string().min(1).max(1024) }).strict(), raw);
        if (contact.appUserId !== (input as { appUserId: string }).appUserId) throw new Error("RUNMUSIC_UNAVAILABLE");
        return json({ kakaoId: decryptRunmusicContact(contact.ciphertext, contact.appUserId, getKey()) });
      }
      return json(action === "receive" ? checked(z.object({ receivedAt: z.iso.datetime({ offset: true }), replayed: z.boolean() }).strict(), raw) : checked(runmusicAdminStateSchema, raw));
    }),
  };
}
