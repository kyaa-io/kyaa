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

/** What was paid, to celebrate together (D8 "+20P · 도장 1"), or undefined when nothing was paid. A declined write
 * (`skippedReason`, points 0) is not a reward; its notice is read with `registrationSkippedReason`. */
export function registrationReward(value: unknown): { points: number; stamps: number } | undefined {
  const parsed = registrationRewardSchema.safeParse(value);
  const reward = parsed.success ? parsed.data.reward : undefined;
  if (!reward) return undefined;
  const stamps = reward.stamps ?? 0;
  return reward.points > 0 || stamps > 0 ? { points: reward.points, stamps } : undefined;
}

/** Why the policy paid nothing for this write (server words, e.g. "capped"), or undefined. */
export function registrationSkippedReason(value: unknown): string | undefined {
  const parsed = registrationRewardSchema.safeParse(value);
  const reward = parsed.success ? parsed.data.reward : undefined;
  return reward && reward.points === 0 && !(reward.stamps ?? 0) ? reward.skippedReason : undefined;
}
