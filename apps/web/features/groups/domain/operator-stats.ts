import { z } from "zod";

const count = z.number().int().min(0);
export const groupOperatorStatsSchema = z.object({
  days: z.union([z.literal(7), z.literal(30)]),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  members: count,
  joinedInPeriod: count,
  posts: count,
  postsInPeriod: count,
  notices: count,
  visitors: count,
  visitDays: count,
  daily: z.array(z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), visitors: count }).strict()).min(1).max(30),
}).strict();
export type GroupOperatorStats = z.infer<typeof groupOperatorStatsSchema>;
