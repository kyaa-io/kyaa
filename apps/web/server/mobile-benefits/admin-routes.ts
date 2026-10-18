import "server-only";
import { z } from "zod";
import { AuthError } from "@/features/auth/domain/auth-errors";
import type { AdminSession } from "@/server/admin/admin-session-gate";
import { adminCorrelationId } from "@/server/g5/blockchain-job-route";

export interface MobileBenefitAdminDependencies {
  authorize(input: { authorization: string; correlationId: string }): Promise<AdminSession>;
  rpc(name: string, args: Record<string, unknown>): Promise<unknown>;
}
const uuid = z.uuid();
const reason = z.string().trim().min(10).max(1000);
const outcome = z.object({ outcome: z.enum(["won", "not_selected"]), weight: z.number().int().positive(), inventoryLimit: z.number().int().positive().nullable(), fulfillmentMethod: z.enum(["digital", "physical_shipping", "on_site_pickup"]).nullable(), imageUrl: z.string().max(2000).nullable() }).strict();
const recipientDeadlinePolicy = z.discriminatedUnion("mode", [z.object({ mode: z.literal("after_award"), durationHours: z.number().int().positive().max(87_600) }).strict(), z.object({ mode: z.literal("fixed"), deadlineAt: z.iso.datetime({ offset: true }) }).strict()]);
const createPolicy = z.object({ benefitId: uuid, mode: z.enum(["period_raffle", "instant_draw"]), policyVersion: z.string().trim().min(1).max(80), ticketCost: z.number().int().positive(), dailyLimit: z.number().int().positive().nullable(), allowPaidTickets: z.boolean(), testerOnly: z.boolean().default(true), opensAt: z.iso.datetime({ offset: true }), closesAt: z.iso.datetime({ offset: true }), resultAt: z.iso.datetime({ offset: true }).nullable(), recipientDeadlinePolicy: recipientDeadlinePolicy.nullable(), outcomes: z.array(outcome).max(100), reason }).strict();
const consentDocument = z.object({ title: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(10_000), documentUrl: z.string().trim().min(1).max(2000).nullable(), items: z.array(z.object({ id: z.string().trim().min(1).max(100), label: z.string().trim().min(1).max(1000), required: z.boolean() }).strict()).min(1).max(100) }).strict();
const createConsent = z.object({ version: z.string().trim().min(1).max(100), effectiveAt: z.iso.datetime({ offset: true }), documents: z.object({ ko: consentDocument, en: consentDocument }).strict(), reason }).strict();
const toggle = z.object({ enabled: z.boolean(), reason }).strict();
const toggleConsent = z.object({ active: z.boolean(), reason }).strict();
const reprocess = z.object({ reason }).strict();
const headers = { "cache-control": "private, no-store", vary: "Authorization" } as const;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });

async function actor(request: Request, deps: MobileBenefitAdminDependencies) {
  const correlationId = adminCorrelationId(request);
  return { correlationId, session: await deps.authorize({ authorization: request.headers.get("authorization") ?? "", correlationId }) };
}
function failure(error: unknown) {
  if (error instanceof AuthError) return json({ error: { code: error.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN" } }, error.status);
  if (error instanceof z.ZodError || error instanceof SyntaxError) return json({ error: { code: "INVALID_REQUEST" } }, 400);
  const message = error instanceof Error ? error.message : "";
  if (message.includes("FORBIDDEN")) return json({ error: { code: "FORBIDDEN" } }, 403);
  const conflict = ["MOBILE_BENEFIT_DISABLE_CURRENT_FIRST", "MOBILE_BENEFIT_POLICY", "MOBILE_BENEFIT_PHYSICAL_FREE_ONLY", "MOBILE_BENEFIT_UNIQUE_CODE_INVENTORY_SHORT", "MOBILE_BENEFIT_CONSENT", "MOBILE_BENEFIT_DEADLINE"].some(code => message.includes(code));
  return json({ error: { code: conflict ? "MOBILE_BENEFIT_POLICY_CONFLICT" : "MOBILE_BENEFIT_ADMIN_UNAVAILABLE" } }, conflict ? 409 : 503);
}

export function createMobileBenefitAdminHandlers(deps: MobileBenefitAdminDependencies) {
  return {
    async policies(request: Request) { try { const { session } = await actor(request, deps); return json(await deps.rpc("read_admin_mobile_benefit_policies", { p_actor_app_user_id: session.appUserId, p_actor_admin_allowlist_id: session.allowlistId })); } catch (e) { return failure(e); } },
    async createPolicy(request: Request) { try { const { session, correlationId } = await actor(request, deps); if (session.role === "viewer") return json({ error: { code: "FORBIDDEN" } }, 403); const p = createPolicy.parse(await request.json()); return json(await deps.rpc("create_admin_mobile_benefit_policy", { p_actor_app_user_id: session.appUserId, p_actor_admin_allowlist_id: session.allowlistId, p_benefit_id: p.benefitId, p_mode: p.mode, p_policy_version: p.policyVersion, p_ticket_cost: p.ticketCost, p_daily_limit: p.dailyLimit, p_allow_paid_tickets: p.allowPaidTickets, p_tester_only: p.testerOnly, p_opens_at: p.opensAt, p_closes_at: p.closesAt, p_result_at: p.resultAt, p_recipient_deadline_policy: p.recipientDeadlinePolicy, p_outcomes: p.outcomes, p_reason: p.reason, p_correlation_id: correlationId }), 201); } catch (e) { return failure(e); } },
    async consents(request: Request) { try { const { session } = await actor(request, deps); return json(await deps.rpc("read_admin_mobile_benefit_consents", { p_actor_app_user_id: session.appUserId, p_actor_admin_allowlist_id: session.allowlistId })); } catch (e) { return failure(e); } },
    async createConsent(request: Request) { try { const { session, correlationId } = await actor(request, deps); if (session.role === "viewer") return json({ error: { code: "FORBIDDEN" } }, 403); const p = createConsent.parse(await request.json()); return json(await deps.rpc("create_admin_mobile_benefit_consent", { p_actor_app_user_id: session.appUserId, p_actor_admin_allowlist_id: session.allowlistId, p_version: p.version, p_effective_at: p.effectiveAt, p_documents: p.documents, p_reason: p.reason, p_correlation_id: correlationId }), 201); } catch (e) { return failure(e); } },
    async toggleConsent(request: Request, version: string) { try { const { session, correlationId } = await actor(request, deps); if (session.role === "viewer") return json({ error: { code: "FORBIDDEN" } }, 403); const p = toggleConsent.parse(await request.json()); return json(await deps.rpc("set_admin_mobile_benefit_consent_active", { p_actor_app_user_id: session.appUserId, p_actor_admin_allowlist_id: session.allowlistId, p_version: z.string().trim().min(1).max(100).parse(version), p_active: p.active, p_reason: p.reason, p_correlation_id: correlationId })); } catch (e) { return failure(e); } },
    async togglePolicy(request: Request, policyId: string) { try { const { session, correlationId } = await actor(request, deps); if (session.role === "viewer") return json({ error: { code: "FORBIDDEN" } }, 403); const p = toggle.parse(await request.json()); return json(await deps.rpc("set_admin_mobile_benefit_policy_enabled", { p_actor_app_user_id: session.appUserId, p_actor_admin_allowlist_id: session.allowlistId, p_policy_id: uuid.parse(policyId), p_enabled: p.enabled, p_reason: p.reason, p_correlation_id: correlationId })); } catch (e) { return failure(e); } },
    async operations(request: Request) { try { const { session } = await actor(request, deps); const url = new URL(request.url); const policyValues = url.searchParams.getAll("policyId"); const limitValues = url.searchParams.getAll("limit"); if (policyValues.length > 1 || limitValues.length > 1 || [...url.searchParams.keys()].some(key => !["policyId", "limit"].includes(key))) throw new SyntaxError("invalid query"); return json(await deps.rpc("read_admin_mobile_benefit_operations", { p_actor_app_user_id: session.appUserId, p_actor_admin_allowlist_id: session.allowlistId, p_policy_id: policyValues[0] ? uuid.parse(policyValues[0]) : null, p_limit: z.coerce.number().int().min(1).max(200).parse(limitValues[0] ?? 100) })); } catch (e) { return failure(e); } },
    async reprocess(request: Request, requestId: string) { try { const { session, correlationId } = await actor(request, deps); if (session.role === "viewer") return json({ error: { code: "FORBIDDEN" } }, 403); const p = reprocess.parse(await request.json()); return json(await deps.rpc("reprocess_admin_mobile_benefit_draw", { p_actor_app_user_id: session.appUserId, p_actor_admin_allowlist_id: session.allowlistId, p_request_id: uuid.parse(requestId), p_reason: p.reason, p_correlation_id: correlationId })); } catch (e) { return failure(e); } },
  };
}
