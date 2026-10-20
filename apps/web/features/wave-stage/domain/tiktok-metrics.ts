import { z } from "zod";
import { waveStageCreatorSlugSchema } from "./wave-stage";

const observation = {
  slug: waveStageCreatorSlugSchema,
  observedAt: z.string().datetime({ offset: true }),
};

export const waveStageTikTokCreatorSchema = z.discriminatedUnion("state", [
  z.object({
    ...observation,
    state: z.literal("live"),
    roomId: z.string().regex(/^[1-9]\d{0,31}$/),
    viewers: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
  }).strict(),
  z.object({ ...observation, state: z.literal("offline") }).strict(),
  z.object({ ...observation, state: z.literal("unavailable") }).strict(),
]);

export const waveStageTikTokResponseSchema = z.object({
  asOf: z.string().datetime({ offset: true }),
  creators: z.array(waveStageTikTokCreatorSchema).length(2),
}).strict();

export type WaveStageTikTokCreator = z.infer<typeof waveStageTikTokCreatorSchema>;
export type WaveStageTikTokResponse = z.infer<typeof waveStageTikTokResponseSchema>;
