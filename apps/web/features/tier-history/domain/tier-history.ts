import { z } from "zod";

// 261107-2 D11. GET /api/me/tier-changes, POST /api/me/tier-changes/seen, GET /api/me/passports/{id}/tier-history.
export const fanTierSchema = z.enum(["Bronze", "Silver", "Gold", "Platinum", "Diamond"]);
export type FanTier = z.infer<typeof fanTierSchema>;

/** A rise not yet celebrated. */
export const tierChangeSchema = z.object({
  id: z.uuid(), passportId: z.uuid(), slug: z.string().min(1), name: z.string().min(1),
  previousTier: fanTierSchema, tier: fanTierSchema, occurredAt: z.string(),
}).strict();
export type TierChange = z.infer<typeof tierChangeSchema>;
export const tierChangesSchema = z.object({ changes: z.array(tierChangeSchema).max(50) }).strict();

export const tierSeenBodySchema = z.object({ ids: z.array(z.uuid()).min(1).max(50) }).strict();

/** One row of a passport's tier history. `start`: the passport was issued at Bronze. `baseline`: the tier found when this history
 * began (the earlier rise is older than the record). `up` / `down`: a change seen right after the action that caused it.
 * `correction`: the tier rule's source was fixed (20261215090000); never celebrated. */
export const tierHistoryItemSchema = z.object({
  id: z.uuid(), kind: z.enum(["start", "baseline", "up", "down", "correction"]), previousTier: fanTierSchema.nullable(), tier: fanTierSchema, occurredAt: z.string(),
}).strict();
export type TierHistoryItem = z.infer<typeof tierHistoryItemSchema>;
export const tierHistorySchema = z.object({ items: z.array(tierHistoryItemSchema).max(200) }).strict();
