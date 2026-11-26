import { z } from "zod";

const count = z.number().int().nonnegative();
const labelled = z.object({ label: z.string().min(1).max(200), signups: count }).strict();

/** read_admin_signup_touches: sign-ups in whole KST days by first-visit path, app browser, day and hour. */
export const signupTouchesSchema = z.object({
  days: z.union([z.literal(7), z.literal(30), z.literal(90)]),
  from: z.string(),
  to: z.string(),
  timeZone: z.literal("Asia/Seoul"),
  total: count,
  paths: z.array(labelled),
  apps: z.array(labelled),
  daily: z.array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), signups: count }).strict()),
  hourly: z.array(z.object({ hour: z.number().int().min(0).max(23), signups: count }).strict()).length(24),
  pathHours: z.array(z.object({ label: z.string().min(1).max(200), date: z.string(), hour: z.number().int().min(0).max(23), signups: count }).strict()),
}).strict();
export type SignupTouchesData = z.infer<typeof signupTouchesSchema>;
