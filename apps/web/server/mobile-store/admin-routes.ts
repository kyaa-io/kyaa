import "server-only";
import { z } from "zod";
import { AuthError } from "@/features/auth/domain/auth-errors";
import type { AdminSession } from "@/server/admin/admin-session-gate";
import { adminCorrelationId } from "@/server/g5/blockchain-job-route";

export interface MobileStoreAdminDependencies {
  authorize(input: { authorization: string; correlationId: string }): Promise<AdminSession>;
  rpc(name: string, args: Record<string, unknown>): Promise<unknown>;
}
const settlement = z.object({ transactionId: z.uuid(), supportKrw: z.number().int().nonnegative(), evidenceAt: z.iso.datetime({ offset: true }), evidenceReference: z.string().trim().min(1).max(500), reason: z.string().trim().min(10).max(1000) }).strict();
const productPolicy = z.object({ store:z.enum(["apple","google"]), productId:z.string().trim().min(1).max(200), policyVersion:z.string().trim().min(1).max(80), ticketQuantity:z.number().int().positive(), supportRateBps:z.number().int().min(0).max(10_000), rewardPolicyVersion:z.number().int().positive(), effectiveAt:z.iso.datetime({offset:true}), expectedCurrentPolicyId:z.uuid().nullable(), reason:z.string().trim().min(10).max(1000) }).strict();
const sandboxTester = z.object({ appUserId:z.uuid(), enabled:z.boolean(), reason:z.string().trim().min(10).max(1000) }).strict();
const headers = { "cache-control": "private, no-store", vary: "Authorization" } as const;
function json(body: unknown, status = 200) { return Response.json(body, { status, headers }); }
function failure(error: unknown) {
  if (error instanceof AuthError) return json({ error: { code: error.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN" } }, error.status);
  if (error instanceof z.ZodError || error instanceof SyntaxError) return json({ error: { code: "INVALID_REQUEST" } }, 400);
  const message = error instanceof Error ? error.message : "";
  if (message.includes("FORBIDDEN")) return json({ error: { code: "FORBIDDEN" } }, 403);
  if (message.includes("MOBILE_STORE_POLICY_CONFLICT")) return json({ error: { code: "POLICY_CONFLICT" } }, 409);
  if (message.includes("MOBILE_STORE_SETTLEMENT") || message.includes("MOBILE_STORE_TRANSACTION_NOT_FOUND")) return json({ error: { code: "SUPPORT_SETTLEMENT_CONFLICT" } }, 409);
  return json({ error: { code: "MOBILE_STORE_ADMIN_UNAVAILABLE" } }, 503);
}
export function createMobileStoreAdminHandlers(deps: MobileStoreAdminDependencies) {
  const actor=async(request:Request)=>{const correlationId=adminCorrelationId(request),session=await deps.authorize({authorization:request.headers.get("authorization")??"",correlationId});return{correlationId,session};};
  return {
  async createProductPolicy(request:Request){try{const{correlationId,session}=await actor(request);if(session.role==="viewer")return json({error:{code:"FORBIDDEN"}},403);const input=productPolicy.parse(await request.json());return json(await deps.rpc("mobile_store_admin_create_product_policy",{p_actor_app_user_id:session.appUserId,p_actor_admin_allowlist_id:session.allowlistId,p_correlation_id:correlationId,p_store:input.store,p_product_id:input.productId,p_policy_version:input.policyVersion,p_ticket_quantity:input.ticketQuantity,p_support_rate_bps:input.supportRateBps,p_reward_policy_version:input.rewardPolicyVersion,p_effective_at:input.effectiveAt,p_expected_current_policy_id:input.expectedCurrentPolicyId,p_reason:input.reason}),201);}catch(error){return failure(error);}},
  async setSandboxTester(request:Request){try{const{correlationId,session}=await actor(request);if(session.role==="viewer")return json({error:{code:"FORBIDDEN"}},403);const input=sandboxTester.parse(await request.json());return json(await deps.rpc("mobile_store_admin_set_sandbox_tester",{p_actor_app_user_id:session.appUserId,p_actor_admin_allowlist_id:session.allowlistId,p_correlation_id:correlationId,p_app_user_id:input.appUserId,p_enabled:input.enabled,p_reason:input.reason}));}catch(error){return failure(error);}},
  async recordSupportSettlement(request: Request) { try {
    const {correlationId,session}=await actor(request);
    if (session.role === "viewer") return json({ error: { code: "FORBIDDEN" } }, 403);
    const input = settlement.parse(await request.json());
    return json(await deps.rpc("mobile_store_admin_record_support_settlement", { p_actor_app_user_id: session.appUserId, p_actor_admin_allowlist_id: session.allowlistId, p_correlation_id: correlationId, p_transaction_id: input.transactionId, p_support_krw: input.supportKrw, p_evidence_at: input.evidenceAt, p_evidence_reference: input.evidenceReference, p_reason: input.reason }), 201);
  } catch (error) { return failure(error); } } };
}
