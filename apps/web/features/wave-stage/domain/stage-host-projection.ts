import { z } from "zod";
import { waveStagePresentationResponseSchema, waveStagePresentationScopeSchema, type WaveStagePresentationResponse } from "./presentation";
import type { WaveStageTikTokResponse } from "./tiktok-metrics";
import { waveStageCreatorSlugSchema, type WaveStage } from "./wave-stage";

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const timestamp = z.string().datetime({ offset: true });
export const stageHostProjectionSchema = z.object({
  presentation: waveStagePresentationResponseSchema.nullable(),
  tiktok: z.object({ creators: z.array(z.object({
    slug: waveStageCreatorSlugSchema, state: z.enum(["live", "offline", "unavailable"]),
    observedAt: timestamp, viewers: count.nullable(),
  }).strict()).length(2).refine(items => new Set(items.map(item => item.slug)).size === 2) }).strict().nullable(),
  presentationFailed: z.boolean(), tiktokFailed: z.boolean(), scope: waveStagePresentationScopeSchema,
  draw: z.object({
    creators: z.array(z.object({ name: z.string(), participantCount: count }).strict()),
    prizes: z.array(z.object({ title: z.string(), winnerQuantity: count, creatorName: z.string() }).strict()),
    results: z.array(z.object({ title: z.string(), creatorName: z.string(), winners: z.array(z.object({ displayName: z.string(), displayCode: z.string() }).strict()) }).strict()),
    executedAt: timestamp.nullable(),
  }).strict().nullable(),
}).strict();
export type StageHostProjection = z.infer<typeof stageHostProjectionSchema>;

export function toStageHostProjection(input: {
  presentation: WaveStagePresentationResponse | null; tiktok: WaveStageTikTokResponse | null;
  presentationFailed: boolean; tiktokFailed: boolean; scope: StageHostProjection["scope"]; stage: WaveStage | null;
}): StageHostProjection {
  const p = input.presentation, stage = input.stage;
  const counts = (item: { reservations: number; passports: number; likes: number; comments: number; engagedFans: number }) => ({
    reservations: item.reservations, passports: item.passports, likes: item.likes, comments: item.comments, engagedFans: item.engagedFans,
  });
  const presentation = p ? {
    asOf: p.asOf, scope: p.scope, from: p.from, to: p.to, eventDate: p.eventDate,
    creators: p.creators.map(c => ({ slug: c.slug, name: c.name, ...counts(c), pending: c.pending, failed: c.failed })),
    onchain: p.onchain.state === "unavailable" ? { state: "unavailable" as const } : {
      state: p.onchain.state, contractAddress: p.onchain.contractAddress, blockNumber: p.onchain.blockNumber,
      blockHash: p.onchain.blockHash, observedAt: p.onchain.observedAt, finality: p.onchain.finality,
      finalizedBlockNumber: p.onchain.finalizedBlockNumber,
      creators: p.onchain.creators.map(c => ({ slug: c.slug, ...counts(c) })),
    },
  } : null;
  const creatorName = (slug: string) => stage?.creators.find(c => c.slug === slug)?.name ?? "";
  return stageHostProjectionSchema.parse({
    presentation, scope: input.scope, presentationFailed: input.presentationFailed, tiktokFailed: input.tiktokFailed,
    tiktok: input.tiktok ? { creators: input.tiktok.creators.map(c => ({ slug: c.slug, state: c.state, observedAt: c.observedAt, viewers: c.state === "live" ? c.viewers : null })) } : null,
    draw: stage ? {
      creators: stage.creators.map(c => ({ name: c.name, participantCount: c.participantCount })),
      prizes: stage.prizes.map(p => ({ title: p.title, winnerQuantity: p.winnerQuantity, creatorName: creatorName(p.creatorSlug) })),
      results: stage.draw?.publishedAt ? stage.prizes.map(p => ({ title: p.title, creatorName: creatorName(p.creatorSlug),
        winners: stage.draw!.winners.filter(w => w.benefitId === p.benefitId).map(w => ({ displayName: w.displayName, displayCode: w.displayCode })),
      })) : [],
      executedAt: stage.draw?.publishedAt ? stage.draw.executedAt : null,
    } : null,
  });
}

export const stageHostSourceCommandSchema = z.discriminatedUnion("action", [
  z.object({ type: z.literal("source-command"), action: z.literal("scope"), scope: waveStagePresentationScopeSchema }).strict(),
  z.object({ type: z.literal("source-command"), action: z.literal("refresh") }).strict(),
]);

export function parseStageHostEndpoint(hash: string): string | null {
  if (!hash.startsWith("#stage-host=")) return null;
  try {
    const endpoint = decodeURIComponent(hash.slice("#stage-host=".length));
    // Match before URL normalization so alternate hosts, credentials and paths cannot be accepted.
    const match = /^ws:\/\/127\.0\.0\.1:([1-9][0-9]{0,4})\/source\?token=[a-fA-F0-9]{64}$/.exec(endpoint);
    return match && Number(match[1]) <= 65535 ? endpoint : null;
  } catch { return null; }
}
