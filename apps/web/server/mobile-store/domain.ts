import { z } from "zod";

export const storeSchema = z.enum(["apple", "google"]);
export type MobileStore = z.infer<typeof storeSchema>;
export const expectedPaidCampaignSchema = z.object({
  benefitId: z.uuid(), policyVersion: z.string().min(1).max(80),
}).strict();
const paidCampaignSchema = z.object({
  benefitId: z.uuid(), policyVersion: z.string(), ticketCost: z.number().int().positive(), opensAt: z.string(), closesAt: z.string(),
  allowedTicketSources: z.tuple([z.literal("free"), z.literal("paid")]), totalWeight: z.number().int().positive(),
  outcomes: z.array(z.object({ outcome: z.enum(["won", "not_selected"]), weight: z.number().int().positive(), fulfillmentMethod: z.literal("digital").nullable(), remainingInventory: z.number().int().nonnegative().nullable() }).strict()).min(1),
}).strict();

export const productSchema = z.object({
  productId: z.string().min(1).max(200), currency: z.literal("KRW"),
  ticketQuantity: z.coerce.number().int().positive(), supportRateBps: z.number().int().min(0).max(10_000),
  policyVersion: z.string().min(1).max(80), paidCampaign: paidCampaignSchema,
}).strict();

export const intentSchema = z.object({
  id: z.uuid(), store: storeSchema, environment: z.literal("sandbox"), productId: z.string(), currency: z.literal("KRW"),
  paidCampaign: z.object({ benefitId: z.uuid(), policyVersion: z.string() }).strict(),
  appAccountToken: z.uuid().nullable(), obfuscatedProfileId: z.uuid().nullable(),
  createdAt: z.iso.datetime({ offset: true }), replayed: z.boolean(),
}).strict();

export const transactionSchema = z.object({
  store: storeSchema, environment: z.enum(["sandbox", "production"]), transactionId: z.string(),
  intentId: z.uuid().nullable(),
  state: z.enum(["pending", "granted", "revoked"]),
  pendingReason: z.enum(["store_pending", "missing_intent", "account_mismatch", "product_mismatch", "currency_mismatch", "amount_unknown", "account_unavailable", "insufficient_balance", "manual_review", "production_rejected"]).nullable(),
  amountKrw: z.coerce.number().int().positive().nullable(), refundedKrw: z.coerce.number().int().nonnegative(),
  supportKrw: z.coerce.number().int().nonnegative(), finishAllowed: z.boolean(), consumeAllowed: z.boolean(),
  productId: z.string().nullable(), celebrityId: z.uuid().nullable(), celebritySlug: z.string().nullable(),
  ticketQuantity: z.coerce.number().int().positive().nullable(), supportRateBps: z.number().int().min(0).max(10_000).nullable(), policyVersion: z.string().nullable(),
  purchasedAt: z.iso.datetime({ offset: true }).nullable(), verifiedAt: z.iso.datetime({ offset: true }),
  settlementStatus: z.enum(["not_applicable", "pending", "settled", "refund_correction_required"]), settlementEvidenceAt: z.iso.datetime({ offset: true }).nullable(),
}).strict();
export type StoreTransaction = z.infer<typeof transactionSchema>;
const settlementStatusSchema = z.enum(["not_applicable", "pending", "settled", "refund_correction_required"]);
export const supportCursorSchema = z.object({ createdAt: z.iso.datetime({ offset: true }), id: z.uuid() }).strict();
export const supportSchema = z.object({ celebrityId: z.uuid(), totalSupportKrw: z.coerce.number().int().nonnegative(),
  pendingSupportKrw: z.coerce.number().int().nonnegative(), settledSupportKrw: z.coerce.number().int().nonnegative(),
  refundAdjustmentKrw: z.coerce.number().int().nonnegative(), settlementCorrectionKrw: z.coerce.number().int().nonnegative(),
  nextCursor: supportCursorSchema.nullable(), purchases: z.array(z.object({
  transactionId: z.uuid(), storeTransactionId: z.string(), productId: z.string(), policyVersion: z.string(), ticketQuantity: z.coerce.number().int().positive(), ticketReversed: z.coerce.number().int().nonnegative(), supportRateBps: z.number().int().min(0).max(10_000),
  amountKrw: z.coerce.number().int().positive().nullable(), refundedKrw: z.coerce.number().int().nonnegative(), supportKrw: z.coerce.number().int().nonnegative(), state: z.enum(["pending", "granted", "revoked"]), purchasedAt: z.iso.datetime({ offset: true }).nullable(),
  refundStatus: z.enum(["none", "partially_refunded", "fully_refunded"]), settlementStatus: settlementStatusSchema, settledSupportKrw: z.coerce.number().int().nonnegative().nullable(), settlementEvidenceAt: z.iso.datetime({ offset: true }).nullable(),
}).strict()).max(100), entries: z.array(z.object({
  id: z.uuid(), transactionId: z.uuid(), amountDeltaKrw: z.coerce.number().int(), resultingTransactionSupportKrw: z.coerce.number().int().nonnegative(), cumulativeRefundedKrw: z.coerce.number().int().nonnegative(), correctionType: z.enum(["purchase", "refund_adjustment"]), settlementStatus: settlementStatusSchema, settlementEvidenceAt: z.iso.datetime({ offset: true }).nullable(), createdAt: z.iso.datetime({ offset: true }),
}).strict()).max(100) }).strict();

export interface VerifiedStoreTransaction {
  store: MobileStore;
  environment: "sandbox" | "production";
  externalTransactionId: string;
  profileId: string | null;
  productId: string;
  currency: string | null;
  amountKrw: number | null;
  refundedKrw: number;
  storeState: "pending" | "purchased" | "revoked";
  verificationFingerprint: string;
  storeEventAt: string | null;
}
