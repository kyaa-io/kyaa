import { z } from "zod";

/** Optional reward the server attaches to a first-time post/comment registration. Replayed or ungranted writes omit it. */
export const registrationRewardSchema = z.object({ reward: z.object({ points: z.number().int().positive(), stamps: z.number().int().positive().optional() }).optional() });
export type RegistrationReward = z.infer<typeof registrationRewardSchema>;

/** Points to play, or undefined when the response carries no valid reward. Never computed on the client. */
export function registrationRewardPoints(value: unknown): number | undefined {
  const parsed = registrationRewardSchema.safeParse(value);
  return parsed.success ? parsed.data.reward?.points : undefined;
}

/** Points and stamps to announce together (C8 "포인트 +20 · 스탬프 +1"), or undefined without a valid reward. Stamps are 0 unless the server says one was stamped. */
export function registrationReward(value: unknown): { points: number; stamps: number } | undefined {
  const parsed = registrationRewardSchema.safeParse(value);
  const reward = parsed.success ? parsed.data.reward : undefined;
  return reward ? { points: reward.points, stamps: reward.stamps ?? 0 } : undefined;
}
