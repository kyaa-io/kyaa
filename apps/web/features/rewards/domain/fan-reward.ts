import { z } from "zod";

export const fanRewardSchema = z.object({
  status: z.enum(["unconfigured", "not_eligible", "awarded"]),
  asset: z.enum(["fan_point", "legacy_free_draw"]),
  amount: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  policyVersion: z.string().nullable(), sourceId: z.uuid().nullable(), ledgerId: z.uuid().nullable(),
}).strict().refine(r => r.status === "awarded"
  ? r.amount > 0 && r.ledgerId !== null && r.sourceId !== null && r.policyVersion !== null
  : r.amount === 0 && r.ledgerId === null);
export type FanReward = z.infer<typeof fanRewardSchema>;

export const fanRewardModeSchema = z.object({mode:z.literal("fan_point"),legacyTicketEarning:z.literal(false)}).strict();

// Internal creator-scoped read. The legacy public response keeps rewardMode absent.
export const creatorFanRewardModeSchema = z.union([
  fanRewardModeSchema,
  z.object({mode: z.literal("legacy_ticket"), legacyTicketEarning: z.literal(true)}).strict(),
]);
