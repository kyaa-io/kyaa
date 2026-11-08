import "server-only";
import { type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createClient } from "@/server/data/client";
import { AuthError } from "@/features/auth/domain/auth-errors";
import { jjinfanCampaignInputSchema, jjinfanCampaignListSchema, jjinfanCampaignSavedSchema, type JjinfanCampaignInput, type JjinfanCampaignList, type JjinfanCampaignSaved } from "@/features/rankings/domain/jjinfan-campaign";
import type { AdminSession } from "@/server/admin/admin-session-gate";

const KNOWN: Record<string, "FORBIDDEN" | "CREATOR_NOT_FOUND" | "INVALID_INPUT"> = {
  "full admin required": "FORBIDDEN", "viewer is read-only": "FORBIDDEN", "active admin required": "FORBIDDEN",
  CREATOR_NOT_FOUND: "CREATOR_NOT_FOUND", JJINFAN_CAMPAIGN_INVALID: "INVALID_INPUT",
};
export type JjinfanCampaignErrorCode = "FORBIDDEN" | "CREATOR_NOT_FOUND" | "INVALID_INPUT" | "JJINFAN_CAMPAIGN_UNAVAILABLE";
export class JjinfanCampaignError extends Error {
  constructor(readonly code: JjinfanCampaignErrorCode = "JJINFAN_CAMPAIGN_UNAVAILABLE") { super(code); }
}

export interface JjinfanCampaignRepository {
  list(actor: AdminSession): Promise<JjinfanCampaignList>;
  save(actor: AdminSession, celebrityId: string, input: JjinfanCampaignInput, correlationId: string): Promise<JjinfanCampaignSaved>;
}

export function createJjinfanCampaignRepository(config: { url: string | undefined; serviceRoleKey: string | undefined }, client?: Pick<SupabaseClient, "rpc">): JjinfanCampaignRepository {
  const db = client ?? createClient(config.url, config.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  async function call(name: string, args: Record<string, unknown>) {
    const { data, error } = await db.rpc(name, args);
    if (error) throw new JjinfanCampaignError(KNOWN[error.message]);
    return data;
  }
  const checked = <T>(schema: z.ZodType<T>, value: unknown) => {
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new JjinfanCampaignError();
    return parsed.data;
  };
  return {
    async list(actor) {
      return checked(jjinfanCampaignListSchema, await call("list_jjinfan_challenge_campaigns", { p_actor_app_user_id: actor.appUserId, p_actor_admin_allowlist_id: actor.allowlistId }));
    },
    async save(actor, celebrityId, input, correlationId) {
      return checked(jjinfanCampaignSavedSchema, await call("set_jjinfan_challenge_campaign", {
        p_actor_app_user_id: actor.appUserId, p_actor_admin_allowlist_id: actor.allowlistId, p_correlation_id: correlationId,
        p_celebrity_id: celebrityId, p_enabled: input.enabled, p_title: input.title, p_description: input.description,
        ...(input.endsOn === undefined ? {} : { p_ends_on: input.endsOn, p_set_ends_on: true }),
      }));
    },
  };
}

const headers = { "cache-control": "private, no-store", vary: "Authorization" };
const failure = (code: string, status: number) => Response.json({ error: { code } }, { status, headers });
const statusOf = (code: JjinfanCampaignErrorCode) => code === "FORBIDDEN" ? 403 : code === "CREATOR_NOT_FOUND" ? 404 : code === "INVALID_INPUT" ? 400 : 503;

/** 찐팬 게이지 settings. Any administrator may read; only a full administrator saves. */
export function createJjinfanCampaignHandlers(dependencies: { authorize(input: { authorization: string; correlationId: string }): Promise<AdminSession>; repository: JjinfanCampaignRepository }) {
  const guarded = async (request: Request, run: (actor: AdminSession, correlationId: string) => Promise<Response>) => {
    const correlationId = crypto.randomUUID();
    try {
      const actor = await dependencies.authorize({ authorization: request.headers.get("authorization") ?? "", correlationId });
      return await run(actor, correlationId);
    } catch (error) {
      if (error instanceof AuthError) return failure(error.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN", error.status === 401 ? 401 : 403);
      if (error instanceof JjinfanCampaignError) return failure(error.code, statusOf(error.code));
      return failure("JJINFAN_CAMPAIGN_UNAVAILABLE", 503);
    }
  };
  return {
    list: (request: Request) => guarded(request, async actor => Response.json(await dependencies.repository.list(actor), { headers })),
    save: (request: Request, celebrityId: string) => guarded(request, async (actor, correlationId) => {
      if (!z.uuid().safeParse(celebrityId).success) return failure("INVALID_INPUT", 400);
      if (actor.role !== "admin") return failure("FORBIDDEN", 403);
      if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return failure("INVALID_INPUT", 400);
      let body: unknown;
      try {
        const raw = await request.text();
        if (raw.length > 4096) return failure("INVALID_INPUT", 400);
        body = JSON.parse(raw);
      } catch { return failure("INVALID_INPUT", 400); }
      const parsed = jjinfanCampaignInputSchema.safeParse(body);
      if (!parsed.success) return failure("INVALID_INPUT", 400);
      return Response.json({ item: await dependencies.repository.save(actor, celebrityId, parsed.data, correlationId) }, { headers });
    }),
  };
}
