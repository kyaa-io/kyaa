import { z } from "zod";

export const photocardClaimSchema = z.object({
  mode: z.enum(["all", "member_pair", "random_three"]),
  ready: z.boolean(),
  selectedBundleId: z.uuid().nullable(),
  options: z.array(z.object({ id: z.uuid(), title: z.string().min(1).max(120) }).strict()),
  assets: z.array(z.object({ id: z.uuid(), width: z.number().int().positive(), height: z.number().int().positive() }).strict()),
}).strict();

export type PhotocardClaim = z.infer<typeof photocardClaimSchema>;
