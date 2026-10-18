import { z } from "zod";

export const localeSchema = z.enum(["ko", "en"]);
export const benefitModeSchema = z.enum(["period_raffle", "instant_draw"]);
export const ticketSourceSchema = z.enum(["free", "paid"]);
const recipientDeadlinePolicySchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("after_award"), durationHours: z.number().int().positive() }).strict(),
  z.object({ mode: z.literal("fixed"), deadlineAt: z.string() }).strict(),
]);

const balanceSchema = z.object({ free: z.number().int().nonnegative(), paid: z.number().int().nonnegative(), total: z.number().int().nonnegative() });
export const catalogSchema = z.object({
  items: z.array(z.object({
    benefitId: z.uuid(), slug: z.string(), title: z.string(), summary: z.string(), mode: benefitModeSchema,
    imageUrl: z.string().nullable(), eligibilityLabel: z.string(),
    eligibility: z.object({ minimumScore: z.number().int().nonnegative(), minimumLevel: z.enum(["Bronze", "Silver", "Gold", "Platinum", "Diamond"]), requiredStampType: z.string().nullable(), requiredActivityType: z.string().nullable(), perUserLimit: z.number().int().positive() }).strict(),
    fulfillmentMethod: z.enum(["digital", "physical_shipping", "on_site_pickup"]), ticketCost: z.number().int().positive(), dailyLimit: z.number().int().positive().nullable(),
    policyVersion: z.string(), opensAt: z.string(), closesAt: z.string(), resultAt: z.string().nullable(),
    recipientDeadlinePolicy: recipientDeadlinePolicySchema.nullable(),
    remainingInventory: z.number().int().nonnegative().nullable(), allowedTicketSources: z.array(ticketSourceSchema),
    periodPolicy: z.object({ campaignId: z.uuid(), perFanTicketLimit: z.number().int().positive().nullable(), winnerQuantity: z.number().int().positive() }).strict().nullable(),
    instantOdds: z.object({ totalWeight: z.number().int().positive(), outcomes: z.array(z.object({ id: z.uuid(), outcome: z.enum(["won", "not_selected"]), weight: z.number().int().positive(), imageUrl: z.string().nullable(), fulfillmentMethod: z.enum(["digital", "physical_shipping", "on_site_pickup"]).nullable(), remainingInventory: z.number().int().nonnegative().nullable() }).strict()).min(1) }).strict().nullable(),
  })),
});
export const ticketWalletSchema = z.object({ celebrityId: z.uuid(), balances: balanceSchema });
export const ticketHistorySchema = z.object({ entries: z.array(z.object({ id: z.uuid(), source: ticketSourceSchema, amount: z.number().int(), status: z.string(), sourceType: z.string(), sourceId: z.uuid(), createdAt: z.string() })) });
export const freeTicketMissionsSchema = z.object({
  celebrityId: z.uuid(),
  policy: z.union([
    z.object({ status: z.literal("unconfigured") }).strict(),
    z.object({ status: z.literal("configured"), activatedAt: z.string(), ruleVersion: z.number().int().positive() }).strict(),
  ]),
  missions: z.array(z.object({
    key: z.enum(["daily_attendance", "eligible_comment", "first_signup"]), status: z.enum(["unconfigured", "available", "processing", "awarded"]),
    ticketAmount: z.number().int().positive().nullable(), ruleVersion: z.number().int().positive().nullable(), scopeKey: z.string().nullable(),
    eligibilitySource: z.enum(["community_stamp_daily_checkin", "eligible_fan_comment", "quiz_pass"]), requiresFanVerification: z.boolean(), defaultPassportCounts: z.literal(false),
    sourceId: z.uuid().nullable(), occurredAt: z.string().nullable(), ledgerId: z.uuid().nullable(), awardedAt: z.string().nullable(),
  }).strict()).length(3),
}).strict();
export const periodEntrySchema = z.object({ entryId: z.uuid(), benefitId: z.uuid(), ticketAmount: z.number().int().positive(), ticketLedgerId: z.uuid(), resultingBalance: z.number().int().nonnegative(), replayed: z.boolean() }).passthrough();
export const instantDrawSchema = z.object({ requestId: z.uuid(), benefitId: z.uuid(), policyVersion: z.string(), outcome: z.enum(["won", "not_selected"]), prizeId: z.uuid().nullable(), awardId: z.uuid().nullable(), freeTicketsUsed: z.number().int().nonnegative(), paidTicketsUsed: z.number().int().nonnegative(), replayed: z.boolean() });
export const requestStatusSchema = z.object({ status: z.literal("unknown") }).strict();
export const periodEntryStatusSchema = z.union([periodEntrySchema, requestStatusSchema]);
export const instantDrawStatusSchema = z.union([instantDrawSchema, requestStatusSchema]);
export const raffleHistorySchema = z.object({ items: z.array(z.object({
  benefitId: z.uuid(), campaignId: z.uuid(), title: z.string(), imageUrl: z.string().nullable(),
  state: z.enum(["cancelled", "not_entered", "pending", "won", "not_won"]), enteredTickets: z.number().int().nonnegative(),
  entryClosesAt: z.string(), publishedAt: z.string().nullable(), winnerId: z.uuid().nullable(),
  method: z.enum(["digital", "physical_shipping", "on_site_pickup"]), fulfillmentStatus: z.string().nullable(),
  claimDisposition: z.string(), recipientDeadlineAt: z.string().nullable(), recipientSubmitted: z.boolean(),
  carrier: z.string().nullable(), trackingNumber: z.string().nullable(), recipientEditable: z.boolean(), policy: z.unknown().nullable(),
}).passthrough()), nextCursor: z.string().nullable() }).strict();
export const goodsSchema = z.object({ items: z.array(z.object({ id: z.uuid(), benefitId: z.uuid(), title: z.string(), imageUrl: z.string().nullable(), fulfillmentMethod: z.string(), fulfillmentStatus: z.string(), wonAt: z.string() })) });
export const goodSchema = z.object({ id: z.uuid(), benefitId: z.uuid(), title: z.string(), imageUrl: z.string().nullable(), fulfillmentMethod: z.string(), fulfillmentStatus: z.string(), wonAt: z.string(), digitalDelivery: z.string().nullable(), recipientDeadlineAt: z.string().nullable(), shareUrl: z.string().regex(/^\/benefits\/[0-9a-f-]{36}$/).nullable(), recipientPolicy: z.object({ consentVersion: z.string(), title: z.string(), body: z.string(), documentUrl: z.string().nullable(), items: z.array(z.object({ id: z.string(), label: z.string(), required: z.boolean() }).strict()).min(1), requiredFields: z.array(z.enum(["name", "phone", "postalCode", "address1", "address2"])) }).strict().nullable() });
export const recipientSchema = z.object({ awardId: z.uuid(), consentVersion: z.string(), name: z.string(), phone: z.string(), postalCode: z.string().nullable(), address1: z.string().nullable(), address2: z.string().nullable(), updatedAt: z.string() });
export const pickupQrSchema = z.object({
  id: z.uuid(), awardId: z.uuid(), rawCode: z.string().min(8), purpose: z.literal("prize_pickup"),
  expiresAt: z.string(), oneTime: z.literal(true), staffConfirmationRequired: z.literal(true), replayed: z.boolean(),
}).strict();
