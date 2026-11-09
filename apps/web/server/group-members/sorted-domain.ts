import { z } from "zod";

export const sortedFanModeSchema = z.enum(["members", "jjinfans", "friends"]);
export type SortedFanMode = z.infer<typeof sortedFanModeSchema>;
export const fanSortPositionSchema = z.object({
  hearts: z.number().int().nonnegative().safe(),
  stamps: z.number().int().nonnegative().safe(),
  last_active_at: z.iso.datetime({ offset: true }),
  app_user_id: z.uuid(),
}).strict();
// No membership/profile identifiers in a browser row, including authenticated viewers.
export const sortedFanRowSchema = z.object({
  nickname: z.string(), avatarUrl: z.string().nullable(), tier: z.string().nullable(),
  hearts: z.number().int().nonnegative().safe(), stamps: z.number().int().nonnegative().safe(),
  first_jjinfan_at: z.iso.datetime({ offset: true }).nullable(),
  last_active_at: z.iso.datetime({ offset: true }),
}).strict();
export const sortedFansSchema = z.object({
  items: z.array(sortedFanRowSchema).max(30), nextCursor: z.string().max(2048).nullable(),
}).strict();
export const sortedFansRpcSchema = sortedFansSchema.extend({ nextCursor: fanSortPositionSchema.nullable() });
