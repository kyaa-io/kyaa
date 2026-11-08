import { z } from "zod";

/** Optional reward the server attaches to a first-time post/comment registration. Replayed or ungranted writes omit it.
 * `stamps` is the mission stamp the same grant placed (261107-2 D6); `rewardSkipped` says why a mission paid nothing when the fan can act on it. */
export const registrationRewardSchema = z.object({
  reward: z.object({ points: z.number().int().positive(), stamps: z.number().int().nonnegative().optional() }).optional(),
  rewardSkipped: z.enum(["too_short", "daily_limit", "same_body", "passport_required"]).optional().catch(undefined),
});
export type RegistrationReward = z.infer<typeof registrationRewardSchema>;
export type RegistrationRewardSkip = NonNullable<RegistrationReward["rewardSkipped"]>;

/** Points to play, or undefined when the response carries no valid reward. Never computed on the client. */
export function registrationRewardPoints(value: unknown): number | undefined {
  const parsed = registrationRewardSchema.safeParse(value);
  return parsed.success ? parsed.data.reward?.points : undefined;
}

/** Stamps the same grant placed (0 when none). */
export function registrationRewardStamps(value: unknown): number {
  const parsed = registrationRewardSchema.safeParse(value);
  return parsed.success ? parsed.data.reward?.stamps ?? 0 : 0;
}

/** Why the mission paid nothing, when the server said so. */
export function registrationRewardSkip(value: unknown): RegistrationRewardSkip | undefined {
  const parsed = registrationRewardSchema.safeParse(value);
  return parsed.success && !parsed.data.reward ? parsed.data.rewardSkipped : undefined;
}
