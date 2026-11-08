import { z } from "zod";

/** The reward a mission write (post, comment) answers with: `{ points, stamps, skippedReason? }`, the same shape as likes and share
 * proofs. Absent when nothing applies; points 0 with `skippedReason` when the mission paid nothing for a reason the fan can act on. */
export const registrationRewardSchema = z.object({
  reward: z.object({
    points: z.number().int().nonnegative(), stamps: z.number().int().nonnegative().optional(),
    skippedReason: z.enum(["too_short", "daily_limit", "same_body", "passport_required"]).optional().catch(undefined),
  }).optional(),
});
export type RegistrationReward = z.infer<typeof registrationRewardSchema>;
export type RegistrationRewardSkip = NonNullable<NonNullable<RegistrationReward["reward"]>["skippedReason"]>;

const read = (value: unknown) => { const parsed = registrationRewardSchema.safeParse(value); return parsed.success ? parsed.data.reward : undefined; };
/** Points to play, or undefined when nothing was paid. Never computed on the client. */
export function registrationRewardPoints(value: unknown): number | undefined { const points = read(value)?.points; return points ? points : undefined; }
/** Stamps the same grant placed (0 when none). */
export function registrationRewardStamps(value: unknown): number { return read(value)?.stamps ?? 0; }
/** Why the mission paid nothing, when the server said so. */
export function registrationRewardSkip(value: unknown): RegistrationRewardSkip | undefined { const reward = read(value); return reward && !reward.points ? reward.skippedReason : undefined; }
