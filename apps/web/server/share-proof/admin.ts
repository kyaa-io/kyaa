import "server-only";
import { z } from "zod";
import { createClient } from "@/server/data/client";
import { loadServerEnv } from "@/server/config/env";
import { AuthError } from "@/features/auth/domain/auth-errors";
import { adminShareProofListSchema, adminShareRevokeBodySchema, adminShareRevokeResultSchema } from "@/features/share-proof/domain/share-proof";
import { bearerToken, type AdminSession } from "@/server/admin/admin-session-gate";
import { boundedJson, correlation, json } from "@/server/certification/certification-http";
import { createCertificationDependencies } from "@/server/certification/certification-dependencies";

/** 261107-2 D12: the operators' list of share proofs and the cancel that takes the grant back (once). */
export interface ShareProofAdminDependencies {
  rpc(name: string, args: Record<string, unknown>): Promise<unknown>;
  authorizeAdmin(authorization: string, correlationId: string): Promise<AdminSession>;
}
export function createShareProofAdminDependencies(): ShareProofAdminDependencies {
  const env = loadServerEnv();
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return {
    rpc: async (name, args) => { const { data, error } = await db.rpc(name, args); if (error) throw new Error(error.message || "SHARE_PROOF_ADMIN_UNAVAILABLE"); return data; },
    authorizeAdmin: createCertificationDependencies().authorizeAdmin,
  };
}
// B3: a repost is revoked through the same route; it must be accepted, within its 7 days, and not the operator's own.
const STATUS: Record<string, number> = { ADMIN_REQUIRED: 403, REASON_REQUIRED: 400, SHARE_PROOF_NOT_FOUND: 404, SHARE_PROOF_NOT_ACCEPTED: 409, CLAWBACK_WINDOW_CLOSED: 409, SELF_REVIEW_FORBIDDEN: 403 };
function mapError(error: unknown) {
  if (error instanceof AuthError) return json({ error: { code: error.code } }, error.status);
  if (error instanceof z.ZodError || error instanceof SyntaxError) return json({ error: { code: "INVALID_REQUEST" } }, 400);
  const message = error instanceof Error ? error.message : "";
  const code = Object.keys(STATUS).find(known => message.includes(known));
  return code ? json({ error: { code } }, STATUS[code]) : json({ error: { code: "SHARE_PROOF_ADMIN_UNAVAILABLE" } }, 503);
}
async function admin(request: Request, deps: ShareProofAdminDependencies) {
  const authorization = request.headers.get("authorization");
  if (!authorization) throw new AuthError("AUTHENTICATION_REQUIRED", 401, "A bearer token is required");
  bearerToken(authorization);
  return deps.authorizeAdmin(authorization, correlation(request));
}
export const shareProofAdminRoutes = {
  list: (deps: ShareProofAdminDependencies) => async (request: Request) => {
    try {
      const url = new URL(request.url), status = url.searchParams.get("status") ?? "accepted", before = url.searchParams.get("before");
      if (!["accepted", "revoked", "all"].includes(status) || (before !== null && Number.isNaN(Date.parse(before)))) return json({ error: { code: "INVALID_REQUEST" } }, 400);
      const actor = await admin(request, deps);
      const parsed = adminShareProofListSchema.safeParse(await deps.rpc("read_admin_share_proofs", { p_actor: actor.appUserId, p_allowlist: actor.allowlistId, p_status: status, p_before: before ? new Date(before).toISOString() : null, p_limit: 50 }));
      if (!parsed.success) throw new Error("SHARE_PROOF_ADMIN_UNAVAILABLE");
      return json({ ...parsed.data, hasMore: parsed.data.items.length === 50 });
    } catch (error) { return mapError(error); }
  },
  revoke: (deps: ShareProofAdminDependencies) => async (request: Request, input: { id: string }) => {
    try {
      const actor = await admin(request, deps);
      if (!z.uuid().safeParse(input.id).success) return json({ error: { code: "INVALID_REQUEST" } }, 400);
      const body = adminShareRevokeBodySchema.parse(await boundedJson(request));
      const parsed = adminShareRevokeResultSchema.safeParse(await deps.rpc("revoke_fan_share_proof", { p_actor: actor.appUserId, p_allowlist: actor.allowlistId, p_proof_id: input.id, p_reason: body.reason }));
      if (!parsed.success) throw new Error("SHARE_PROOF_ADMIN_UNAVAILABLE");
      return json({ result: parsed.data });
    } catch (error) { return mapError(error); }
  },
};
