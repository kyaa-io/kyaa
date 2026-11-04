import { z } from "zod";

/** Optional reward the server attaches to a first-time post/comment registration. Replayed or ungranted writes omit it. */
export const registrationRewardSchema = z.object({ reward: z.object({ points: z.number().int().positive() }).optional() });
export type RegistrationReward = z.infer<typeof registrationRewardSchema>;

/** Points to play, or undefined when the response carries no valid reward. Never computed on the client. */
export function registrationRewardPoints(value: unknown): number | undefined {
  const parsed = registrationRewardSchema.safeParse(value);
  return parsed.success ? parsed.data.reward?.points : undefined;
}
