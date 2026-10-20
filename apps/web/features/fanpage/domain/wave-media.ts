import { z } from "zod";
import { clipAssetSchema, fanClipSchema, fanClipCommentSchema } from "@/server/mobile-content/domain";

export const waveAlbumSchema = fanClipSchema.extend({
  assets: z.array(clipAssetSchema).min(1).max(30),
  commentPreview: fanClipCommentSchema.nullable().optional(),
});
export const waveAlbumPageSchema = z.object({ items: z.array(waveAlbumSchema).max(50), nextCursor: z.string().nullable() }).strict();
export const createWaveAlbumSchema = z.object({
  body: z.string().trim().max(5000).default(""), assetIds: z.array(z.uuid()).min(1).max(30), idempotencyKey: z.uuid(),
}).strict().refine(value => new Set(value.assetIds).size === value.assetIds.length, "Duplicate asset");
export const waveAlbumWriteSchema = z.object({ id: z.uuid(), revision: z.number().int().positive(), replayed: z.boolean() }).strict();
export type WaveAlbum = z.infer<typeof waveAlbumSchema>;
export type WaveAlbumPage = z.infer<typeof waveAlbumPageSchema>;
