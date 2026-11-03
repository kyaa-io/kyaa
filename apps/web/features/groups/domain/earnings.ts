import { z } from "zod";

export const groupEarningKindSchema = z.enum(["mission", "activity", "legacy_activity", "raffle"]);
export const groupEarningKeySchema = z.string().regex(/^(mission|activity|legacy_activity|raffle):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const amount = z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER).nullable();
export const groupEarningEntrySchema = z.object({
  entryKey: groupEarningKeySchema,
  kind: groupEarningKindSchema,
  activityKey: z.string().min(1).max(100),
  title: z.string().nullable(),
  status: z.enum(["pending", "rejected", "credited", "no_reward", "correction_review", "corrected", "entered", "refunded"]),
  asset: z.enum(["fan_point", "ticket", "legacy_free_draw"]),
  originalAmount: amount,
  correctionAmount: amount,
  netAmount: amount,
  reason: z.string().nullable(),
  occurredAt: z.iso.datetime({ offset: true }),
  processedAt: z.iso.datetime({ offset: true }).nullable(),
  activityHref: z.string().startsWith("/pages/groups/").nullable(),
}).strict();
export const groupEarningsSchema = z.object({ entries: z.array(groupEarningEntrySchema), nextCursor: z.string().max(2048).nullable() }).strict();
export const groupEarningDetailSchema = z.object({ entry: groupEarningEntrySchema }).strict();
export type GroupEarningEntry = z.infer<typeof groupEarningEntrySchema>;
export type GroupEarnings = z.infer<typeof groupEarningsSchema>;
