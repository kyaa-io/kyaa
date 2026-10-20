import { z } from "zod";

export const waveStageCreatorSlugSchema = z.enum(["changha", "wena"]);
export const waveStagePrizeKindSchema = z.enum(["coffee_chat", "hotel_coffee"]);
const timestamp = z.string().datetime({ offset: true });
export const waveStageResponseSchema = z.object({
  stage: z.object({
    eventKey: z.string(),
    asOf: timestamp,
    liveSlug: z.string(),
    creators: z.array(z.object({
      slug: waveStageCreatorSlugSchema,
      name: z.string(),
      campaignId: z.string().uuid(),
      revision: z.number().int().positive(),
      entryClosesAt: timestamp,
      participantCount: z.number().int().nonnegative(),
      reservationCount: z.number().int().nonnegative(),
      weightedEntryCount: z.number().int().nonnegative(),
      photocardEligibleCount: z.number().int().nonnegative(),
    }).strict()),
    prizes: z.array(z.object({
      benefitId: z.string().uuid(),
      creatorSlug: waveStageCreatorSlugSchema,
      kind: waveStagePrizeKindSchema,
      title: z.string(),
      winnerQuantity: z.number().int().positive(),
    }).strict()),
    drawConflict: z.boolean(),
    draw: z.object({
      executedAt: timestamp,
      publishedAt: timestamp,
      winners: z.array(z.object({
        benefitId: z.string().uuid(),
        creatorSlug: waveStageCreatorSlugSchema,
        displayName: z.string(),
        displayCode: z.string(),
      }).strict()),
    }).strict().nullable(),
  }).strict(),
}).strict();
export const waveStageDrawRequestSchema = z.object({
  idempotencyKey: z.string().uuid(),
  expectedRevisions: z.object({ changha: z.number().int().positive(), wena: z.number().int().positive() }).strict(),
}).strict();
export type WaveStageResponse = z.infer<typeof waveStageResponseSchema>;
export type WaveStage = WaveStageResponse["stage"];
export type WaveStageCreator = WaveStage["creators"][number];
export type WaveStagePrize = WaveStage["prizes"][number];
export type WaveStageDrawRequest = z.infer<typeof waveStageDrawRequestSchema>;
