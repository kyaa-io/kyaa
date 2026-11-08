import { z } from "zod";

/** Optional reward the server attaches to a first-time post/comment registration. Replayed or ungranted writes omit it. */
export const registrationRewardSchema = z.object({ reward: z.object({ points: z.number().int().nonnegative(), stamps: z.number().int().nonnegative().optional(), skippedReason: z.string().optional() }).optional() });
export type RegistrationReward = z.infer<typeof registrationRewardSchema>;

/** Points to play, or undefined when the response carries no valid reward. Never computed on the client. */
export function registrationRewardPoints(value: unknown): number | undefined {
  const parsed = registrationRewardSchema.safeParse(value);
  const points = parsed.success ? parsed.data.reward?.points : undefined;
  return points && points > 0 ? points : undefined;
}
