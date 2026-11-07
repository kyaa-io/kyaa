import "server-only";
import { z } from "zod";
import { type SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/server/data/client";
import { loadServerEnv } from "../config/env";
import { AuthError } from "../../features/auth/domain/auth-errors";
import { bearerToken, type AdminSession } from "../admin/admin-session-gate";
import { boundedJson, correlation, json } from "./certification-http";
import { createCertificationDependencies } from "./certification-dependencies";

// Admin side of the passport proof flow (contract 7 ADM): review queue, approve / reject / request resubmission, stamp void,
// and a short-lived signed link to a submitted image (private, pre-masking images included; admin only).

export const PROOF_DECISIONS = ["approved", "rejected", "changes_requested", "in_review"] as const;
export type ProofDecision = (typeof PROOF_DECISIONS)[number];

const KNOWN_CODES = [
  "ADMIN_REQUIRED", "DECISION_INVALID", "REASON_REQUIRED", "PROOF_NOT_FOUND", "REVISION_CONFLICT", "INVALID_TRANSITION",
  "PROOF_STAMP_UNAVAILABLE", "PROOF_INVALID", "STAMP_NOT_FOUND", "GROUP_WALLET_UNAVAILABLE", "GROUP_WALLET_WRITE_FENCED",
  "FAN_WEB_ACTIVE_ACCOUNT_REQUIRED", "PROOF_ALREADY_APPROVED",
] as const;
const STATUS: Record<string, number> = {
  ADMIN_REQUIRED: 403, REASON_REQUIRED: 400, DECISION_INVALID: 400, PROOF_INVALID: 400,
  PROOF_NOT_FOUND: 404, STAMP_NOT_FOUND: 404, REVISION_CONFLICT: 409, INVALID_TRANSITION: 409, PROOF_STAMP_UNAVAILABLE: 409,
  GROUP_WALLET_UNAVAILABLE: 503, GROUP_WALLET_WRITE_FENCED: 503,
  FAN_WEB_ACTIVE_ACCOUNT_REQUIRED: 403, PROOF_ALREADY_APPROVED: 409,
};

export class ProofAdminError extends Error {
  constructor(readonly code: string) { super(code); this.name = "ProofAdminError"; }
}
function fail(error: { message?: string } | null): never {
  const message = error?.message ?? "";
  // The unique index certification_membership_approved_once answers 23505 for a second approved membership: the member already holds it.
  if (message.includes("certification_membership_approved_once")) throw new ProofAdminError("PROOF_ALREADY_APPROVED");
  throw new ProofAdminError(KNOWN_CODES.find((code) => message.includes(code)) ?? "PROOF_ADMIN_UNAVAILABLE");
}

const uuid = z.uuid();
export const reviewBodySchema = z.object({
  expectedRevision: z.number().int().min(1),
  decision: z.enum(PROOF_DECISIONS),
  reason: z.string().trim().min(3).max(1000).optional(),
}).strict().superRefine((value, ctx) => {
  if ((value.decision === "rejected" || value.decision === "changes_requested") && !value.reason) {
    ctx.addIssue({ code: "custom", path: ["reason"], message: "REASON_REQUIRED" });
  }
});
export const voidBodySchema = z.object({
  requestKey: z.string().min(8).max(100),
  reason: z.string().trim().min(3).max(1000),
  sanction: z.boolean().default(false),
}).strict();

const reviewResultSchema = z.object({
  id: z.uuid(), status: z.string(), revision: z.number().int(), replayed: z.boolean(),
  points: z.number().int().optional(), capped: z.boolean().optional(), stampId: z.string().nullish(),
  pageNo: z.number().nullish(), slotNo: z.number().nullish(), firstApproval: z.boolean().optional(),
  titleIssued: z.boolean().optional(), postId: z.string().nullish(),
}).loose();
const voidResultSchema = z.object({
  stampId: z.string(), replayed: z.boolean(), pointCorrection: z.enum(["none", "corrected", "review"]), jjinfanRevoked: z.boolean(),
}).loose();
// get_admin_proof_queue row: what the reviewer needs on one line.
export const queueRowSchema = z.object({
  id: z.uuid(), status: z.string(), revision: z.number().int(), createdAt: z.string(),
  proofType: z.string(), publishConsent: z.boolean(), amountVisible: z.boolean(),
  applicantName: z.string().nullish(), creatorName: z.string().nullish(),
  duplicateOf: z.array(z.uuid()).default([]), rejectionReason: z.string().nullish(), uploadIds: z.array(z.uuid()).default([]),
  postBody: z.string().nullish(),
}).loose();
// read_passport_point_reviews row: one correction still waiting for follow-up (newest first).
export const pointReviewRowSchema = z.object({
  id: z.string(), stampId: z.string().nullish(), appUserId: z.string(), celebrityId: z.string(), amount: z.number().int(),
  reason: z.string().nullish(), voidReason: z.string().nullish(), source: z.enum(["attendance", "action"]), createdAt: z.string(),
}).loose();
export type PointReviewRow = z.infer<typeof pointReviewRowSchema>;
export const POINT_REVIEW_PAGE = 50;
const proofSourceSchema = z.object({ bucket: z.string().min(1), storagePath: z.string().min(1).max(500) }).loose();
export const PROOF_IMAGE_LINK_SECONDS = 120;
export type ProofQueueRow = z.infer<typeof queueRowSchema>;

export class ProofAdminRepository {
  constructor(private readonly db: Pick<SupabaseClient, "rpc" | "storage">) {}
  async queue(actor: AdminSession, status: string): Promise<ProofQueueRow[]> {
    const { data, error } = await this.db.rpc("get_admin_proof_queue", { p_actor: actor.appUserId, p_status: status });
    if (error) fail(error);
    return z.array(queueRowSchema).parse(data);
  }
  async pointReviews(actor: AdminSession, before: string | null): Promise<PointReviewRow[]> {
    const { data, error } = await this.db.rpc("read_passport_point_reviews", { p_actor: actor.appUserId, p_limit: POINT_REVIEW_PAGE, p_before: before });
    if (error) fail(error);
    return z.array(pointReviewRowSchema).parse(data);
  }
  // Authorization is the same database check as the existing admin image route (the upload must belong to the submission); the link is never stored or logged.
  async imageLink(actor: AdminSession, submissionId: string, uploadId: string): Promise<{ url: string; expiresInSeconds: number } | null> {
    const { data, error } = await this.db.rpc("get_admin_certification_proof_source", {
      p_actor: actor.appUserId, p_allowlist: actor.allowlistId, p_submission_id: submissionId, p_upload_id: uploadId });
    if (error) fail(error);
    if (data === null) return null;
    const source = proofSourceSchema.parse(data);
    const signed = await this.db.storage.from(source.bucket).createSignedUrl(source.storagePath, PROOF_IMAGE_LINK_SECONDS);
    if (signed.error || !signed.data?.signedUrl) throw new ProofAdminError("PROOF_ADMIN_UNAVAILABLE");
    return { url: signed.data.signedUrl, expiresInSeconds: PROOF_IMAGE_LINK_SECONDS };
  }
  async review(actor: AdminSession, submissionId: string, input: { expectedRevision: number; decision: ProofDecision; reason?: string }) {
    const { data, error } = await this.db.rpc("review_certification_proof", {
      p_actor: actor.appUserId, p_submission_id: submissionId, p_expected_revision: input.expectedRevision,
      p_decision: input.decision, p_reason: input.reason ?? null
    });
    if (error) fail(error);
    return reviewResultSchema.parse(data);
  }
  async voidStamp(actor: AdminSession, stampId: string, input: { reason: string; sanction: boolean; requestKey: string }) {
    const { data, error } = await this.db.rpc("void_passport_stamp", {
      p_actor: actor.appUserId, p_stamp_id: stampId, p_reason: input.reason, p_sanction: input.sanction, p_request_key: input.requestKey,
    });
    if (error) fail(error);
    return voidResultSchema.parse(data);
  }
}

export interface ProofAdminDependencies {
  repository: ProofAdminRepository;
  authorizeAdmin(authorization: string, correlationId: string): Promise<AdminSession>;
}
export function createProofAdminDependencies(): ProofAdminDependencies {
  const env = loadServerEnv();
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return { repository: new ProofAdminRepository(db), authorizeAdmin: createCertificationDependencies().authorizeAdmin };
}

async function admin(request: Request, deps: ProofAdminDependencies): Promise<AdminSession> {
  const authorization = request.headers.get("authorization");
  if (!authorization) throw new AuthError("AUTHENTICATION_REQUIRED", 401, "A bearer token is required");
  bearerToken(authorization);
  return deps.authorizeAdmin(authorization, correlation(request));
}
function mapError(error: unknown): Response {
  if (error instanceof AuthError) return json({ error: { code: error.code } }, error.status);
  if (error instanceof ProofAdminError) return json({ error: { code: error.code } }, STATUS[error.code] ?? 503);
  if (error instanceof z.ZodError || error instanceof SyntaxError) return json({ error: { code: "INVALID_REQUEST" } }, 400);
  return json({ error: { code: "PROOF_ADMIN_UNAVAILABLE" } }, 503);
}

export const proofAdminRoutes = {
  queue: (deps: ProofAdminDependencies) => async (request: Request) => {
    try {
      const status = new URL(request.url).searchParams.get("status") ?? "pending";
      if (!["pending", "in_review", "approved", "rejected", "changes_requested"].includes(status)) return json({ error: { code: "INVALID_STATUS" } }, 400);
      const actor = await admin(request, deps);
      return json({ submissions: await deps.repository.queue(actor, status) });
    } catch (e) { return mapError(e); }
  },
  pointReviews: (deps: ProofAdminDependencies) => async (request: Request) => {
    try {
      const raw = new URL(request.url).searchParams.get("before");
      if (raw !== null && Number.isNaN(Date.parse(raw))) return json({ error: { code: "INVALID_REQUEST" } }, 400);
      const actor = await admin(request, deps);
      const reviews = await deps.repository.pointReviews(actor, raw === null ? null : new Date(raw).toISOString());
      return json({ reviews, hasMore: reviews.length === POINT_REVIEW_PAGE });
    } catch (e) { return mapError(e); }
  },
  review: (deps: ProofAdminDependencies) => async (request: Request, input: { id: string }) => {
    try {
      const actor = await admin(request, deps);
      if (!uuid.safeParse(input.id).success) return json({ error: { code: "INVALID_REQUEST" } }, 400);
      const body = reviewBodySchema.parse(await boundedJson(request));
      const result = await deps.repository.review(actor, input.id, {
        expectedRevision: body.expectedRevision, decision: body.decision, reason: body.reason
      });
      return json({ submission: result });
    } catch (e) { return mapError(e); }
  },
  imageLink: (deps: ProofAdminDependencies) => async (request: Request, input: { id: string; uploadId: string }) => {
    try {
      const actor = await admin(request, deps);
      if (!uuid.safeParse(input.id).success || !uuid.safeParse(input.uploadId).success) return json({ error: { code: "INVALID_REQUEST" } }, 400);
      const link = await deps.repository.imageLink(actor, input.id, input.uploadId);
      return link ? json({ image: link }) : json({ error: { code: "NOT_FOUND" } }, 404);
    } catch (e) { return mapError(e); }
  },
  voidStamp: (deps: ProofAdminDependencies) => async (request: Request, input: { id: string }) => {
    try {
      const actor = await admin(request, deps);
      if (!uuid.safeParse(input.id).success) return json({ error: { code: "INVALID_REQUEST" } }, 400);
      const body = voidBodySchema.parse(await boundedJson(request));
      return json({ result: await deps.repository.voidStamp(actor, input.id, body) });
    } catch (e) { return mapError(e); }
  },
};
