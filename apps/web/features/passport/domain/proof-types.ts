import { z } from "zod";
import { APP_LOCALES } from "@/i18n/locales";

// Contract §3.6 / §4 (PASSPORT-RENEWAL P3). Shared by the proof API (server/dukjil/proofs.ts) and the proof screens.
// Slot 09 proof kinds (the guide lists these). sns_post is the slot 07 screenshot of the fan's own SNS post: same submit and review path,
// paid as the subscription action, never published on the proof board.
export const PROOF_TYPES = ["membership", "purchase", "receipt", "ticket", "donation", "funding", "kyaa_payment"] as const;
export const SNS_POST_PROOF = "sns_post";
export const SUBMITTABLE_PROOF_TYPES = [...PROOF_TYPES, SNS_POST_PROOF] as const;
export const SNS_POST_PLATFORMS = ["instagram", "tiktok", "x", "threads", "youtube"] as const;
export const proofTypeSchema = z.enum(SUBMITTABLE_PROOF_TYPES);
export type ProofType = z.infer<typeof proofTypeSchema>;

export const PROOF_STATUSES = ["pending", "in_review", "approved", "changes_requested", "rejected"] as const;
export const proofStatusSchema = z.enum(PROOF_STATUSES);
export type ProofStatus = z.infer<typeof proofStatusSchema>;

export const PROOF_NOTE_MAX = 200;
export const PROOF_BOARD_MAX = 50;
// Perceptual hash computed in the browser: 1-3 lowercase hex strings (one per image). The length range is wide on purpose;
// the DB only checks the array size (1-3).
export const proofPhashSchema = z.array(z.string().regex(/^[0-9a-f]{8,64}$/)).min(1).max(3);

export const proofSubmitBodySchema = z.object({
  requestKey: z.uuid(),
  creator: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),
  proofType: proofTypeSchema,
  uploadId: z.uuid(),
  publishConsent: z.boolean(),
  amountVisible: z.boolean().nullable(),
  imagePhash: proofPhashSchema,
  note: z.string().trim().max(PROOF_NOTE_MAX).optional(),
  locale: z.enum(APP_LOCALES).optional(),
}).strict().refine((body) => body.proofType !== SNS_POST_PROOF || !body.publishConsent, { message: "an SNS post is not published on the proof board", path: ["publishConsent"] });
export type ProofSubmitBody = z.infer<typeof proofSubmitBodySchema>;

export const proofResubmitBodySchema = z.object({
  expectedRevision: z.number().int().min(0),
  uploadId: z.uuid(),
  imagePhash: proofPhashSchema,
  note: z.string().trim().max(PROOF_NOTE_MAX).optional(),
  locale: z.enum(APP_LOCALES).optional(),
}).strict();
export type ProofResubmitBody = z.infer<typeof proofResubmitBodySchema>;

// POST /api/me/proofs, POST /api/me/proofs/{id}/resubmit. status is always "pending" after a submit or resubmit.
export const proofCommandResultSchema = z.object({
  submissionId: z.uuid(), status: z.literal("pending"), revision: z.number().int().min(0), replayed: z.boolean(),
}).strict();
export type ProofCommandResult = z.infer<typeof proofCommandResultSchema>;

// GET /api/me/proofs?creator=slug. The reason is present only for changes_requested and rejected.
export const myProofItemSchema = z.object({
  submissionId: z.uuid(), proofType: proofTypeSchema, status: proofStatusSchema, revision: z.number().int().min(0),
  reason: z.string().nullable(), publishConsent: z.boolean(), amountVisible: z.boolean().nullable(),
  submittedAt: z.string(), reviewedAt: z.string().nullable(),
}).strict();
export const myProofsSchema = z.object({ items: z.array(myProofItemSchema) }).strict();
export type MyProofItem = z.infer<typeof myProofItemSchema>;

// GET /api/pages/{pageId}/posts?category=proof. No author or submission id. imageUrl is an API path that streams the member's masked image
// (consented, approved, visible posts only); it never carries a bucket path or a signed URL. jjinfanRank is the "n-th jjinfan" number or null.
export const proofBoardItemSchema = z.object({
  awardedPoints: z.number().int().min(0).nullable().optional(),
  postId: z.uuid(), body: z.string(), createdAt: z.string(), proofType: proofTypeSchema, amountVisible: z.boolean().nullable(),
  imageUrl: z.string().regex(/^\/api\/pages\/[^/?#]+\/posts\/[0-9a-f-]{36}\/image\?t=[^&#]+$/).nullable(), jjinfanRank: z.number().int().min(1).nullable(),
}).strict();
export const proofBoardSchema = z.object({ items: z.array(proofBoardItemSchema), nextBefore: z.string().nullable() }).strict();
export type ProofBoardItem = z.infer<typeof proofBoardItemSchema>;
export type ProofBoard = z.infer<typeof proofBoardSchema>;

// GET /api/me/proofs/missions?creator=slug: the submittable proof missions of a page. missionId feeds POST /api/certifications/{missionId}/uploads.
export const proofMissionItemSchema = z.object({
  missionId: z.uuid(), proofType: proofTypeSchema, platform: z.string().nullable(),
  submittable: z.boolean(), unavailableReason: z.enum(["PROOF_ALREADY_APPROVED", "PROOF_ALREADY_OPEN", "PROOF_MONTHLY_LIMIT"]).nullable(), closesAt: z.string(),
}).strict();
export const proofMissionListSchema = z.object({ items: z.array(proofMissionItemSchema) }).strict();
export type ProofMissionItem = z.infer<typeof proofMissionItemSchema>;
export type ProofMissionList = z.infer<typeof proofMissionListSchema>;

export const PROOF_ERROR_CODES = [
  "INVALID_REQUEST", "AUTHENTICATION_REQUIRED", "FORBIDDEN", "CREATOR_NOT_FOUND", "PROOF_INVALID", "PROOF_PII_DETECTED", "PROOF_MONTHLY_LIMIT",
  "PROOF_ALREADY_OPEN", "PROOF_ALREADY_APPROVED", "PROOF_MISSION_UNAVAILABLE", "PROOF_MISSION_LEGACY", "PROOF_TYPE_MISMATCH", "PROOF_NOT_FOUND", "PROOF_STAMP_UNAVAILABLE", "UPLOAD_INVALID",
  "UPLOAD_EXPIRED", "PASSPORT_REQUIRED", "IDEMPOTENCY_MISMATCH", "REVISION_CONFLICT", "PROOF_UNAVAILABLE",
] as const;
export type ProofErrorCode = (typeof PROOF_ERROR_CODES)[number];
